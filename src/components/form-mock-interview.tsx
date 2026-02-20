import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";

import type { Interview } from "@/types";

import { CustomBreadCrumb } from "./custom-bread-crumb";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { Headings } from "./headings";
import { Button } from "./ui/button";
import { Loader, Trash2 } from "lucide-react";
import { Separator } from "./ui/separator";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { chatSession } from "@/scripts";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/config/firebase.config";

interface FormMockInterviewProps {
  initialData: Interview | null;
}

const formSchema = z.object({
  position: z
    .string()
    .min(1, "Position is required")
    .max(100, "Position must be 100 characters or less"),
  description: z.string().min(10, "Description is required"),
  experience: z.coerce
    .number()
    .min(0, "Experience cannot be empty or negative"),
  techStack: z.string().min(1, "Tech stack must be at least a character"),
});

type FormData = z.infer<typeof formSchema>;

type InterviewQuestion = { question: string; answer: string };
const AI_TIMEOUT_MS = 60000;
const AI_RETRY_TIMEOUT_MS = 90000;

const extractFirstJsonArray = (text: string): string | null => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === "]" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
};

const withTimeout = async <T,>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const FormMockInterview = ({ initialData }: FormMockInterviewProps) => {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      position: initialData?.position ?? "",
      description: initialData?.description ?? "",
      experience: initialData?.experience ?? 0,
      techStack: initialData?.techStack ?? "",
    },
  });

  const { isValid, isSubmitting } = form.formState;
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { userId } = useAuth();

  const title = initialData
    ? initialData.position
    : "Create a new mock interview";

  const breadCrumpPage = initialData ? initialData?.position : "Create";
  const actions = initialData ? "Save Changes" : "Create";
  const toastMessage = initialData
    ? { title: "Updated..!", description: "Changes saved successfully..." }
    : { title: "Created..!", description: "New Mock Interview created..." };

  const cleanAiResponse = (responseText: string) => {
    let cleanText = responseText.trim();

    // Remove markdown code fences but keep payload intact.
    cleanText = cleanText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    const extractedArray = extractFirstJsonArray(cleanText) ?? cleanText;
    const normalized = Array.from(extractedArray)
      .map((char) => (char.charCodeAt(0) < 32 ? " " : char))
      .join("");

    try {
      return JSON.parse(normalized);
    } catch (error) {
      throw new Error("Invalid JSON format: " + (error as Error)?.message);
    }
  };

  const isValidQuestions = (data: unknown): data is InterviewQuestion[] => {
    if (!Array.isArray(data)) return false;

    return data.every((item) => {
      if (typeof item !== "object" || item === null) return false;

      const question = (item as { question?: unknown }).question;
      const answer = (item as { answer?: unknown }).answer;

      return (
        typeof question === "string" &&
        question.trim().length > 0 &&
        typeof answer === "string" &&
        answer.trim().length > 0
      );
    });
  };

  const buildFallbackQuestions = (data: FormData): InterviewQuestion[] => {
    return [
      {
        question: `Introduce your approach to building a ${data.position} project using ${data.techStack}.`,
        answer:
          "Define requirements, design architecture, break work into milestones, implement iteratively, and validate with tests and monitoring.",
      },
      {
        question: `How would you structure a scalable codebase for ${data.position}?`,
        answer:
          "Use modular boundaries, separate concerns, enforce code standards, add shared utilities, and document conventions for long-term maintainability.",
      },
      {
        question: `How do you handle debugging and performance issues in ${data.techStack}?`,
        answer:
          "Reproduce reliably, collect logs/metrics, profile bottlenecks, fix root causes, and verify improvements with measurable benchmarks.",
      },
      {
        question: `What testing strategy would you follow for this role?`,
        answer:
          "Combine unit, integration, and end-to-end tests with CI checks to prevent regressions and ensure release confidence.",
      },
      {
        question: `How do you collaborate with product/design teams on ambiguous requirements?`,
        answer:
          "Clarify assumptions early, align on acceptance criteria, communicate tradeoffs, and iterate with frequent feedback loops.",
      },
    ];
  };

  const generateAiResponse = async (
    data: FormData
  ): Promise<InterviewQuestion[]> => {
    const prompt = `
        As an experienced prompt engineer, generate a JSON array containing 5 technical interview questions along with detailed answers based on the following job information. Each object in the array should have the fields "question" and "answer", formatted as follows:

        [
          { "question": "<Question text>", "answer": "<Answer text>" },
          ...
        ]

        Job Information:
        - Job Position: ${data?.position}
        - Job Description: ${data?.description}
        - Years of Experience Required: ${data?.experience}
        - Tech Stacks: ${data?.techStack}

        The questions should assess skills in ${data?.techStack} development and best practices, problem-solving, and experience handling complex requirements. Please format the output strictly as an array of JSON objects without any additional labels, code blocks, or explanations. Return only the JSON array with questions and answers.
        `;

    const aiResult = await chatSession.sendMessage(prompt);
    const cleanedResponse = cleanAiResponse(aiResult.response.text());

    if (!isValidQuestions(cleanedResponse)) {
      throw new Error("AI returned unexpected question format");
    }

    return cleanedResponse;
  };

  const onSubmit = async (data: FormData) => {
    try {
      setLoading(true);
      if (!userId) throw new Error("You must be signed in to create interview");

      let questions: InterviewQuestion[] = [];
      try {
        questions = await withTimeout(generateAiResponse(data), AI_TIMEOUT_MS, "AI generation timed out");
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown AI error";
        const isTimeout = reason.toLowerCase().includes("timed out");

        if (isTimeout) {
          try {
            questions = await withTimeout(
              generateAiResponse(data),
              AI_RETRY_TIMEOUT_MS,
              "AI generation timed out after retry"
            );
          } catch (retryError) {
            console.error("AI generation failed after retry, using fallback questions", retryError);
            const retryReason =
              retryError instanceof Error ? retryError.message : "Unknown AI error";
            questions = buildFallbackQuestions(data);
            toast.warning("AI generation issue", {
              description: `Using fallback interview questions for now. (${retryReason})`,
            });
          }
        } else {
          console.error("AI generation failed, using fallback questions", error);
          questions = buildFallbackQuestions(data);
          toast.warning("AI generation issue", {
            description: `Using fallback interview questions for now. (${reason})`,
          });
        }
      }

      if (initialData) {
        // update
        if (isValid) {
          await withTimeout(
            updateDoc(doc(db, "interviews", initialData?.id), {
              questions,
              ...data,
              updatedAt: serverTimestamp(),
            }),
            30000,
            "Saving interview timed out"
          );
          toast(toastMessage.title, { description: toastMessage.description });
        }
      } else {
        // create a new mock interview
        if (isValid) {
          await withTimeout(
            addDoc(collection(db, "interviews"), {
              ...data,
              userId,
              questions,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            30000,
            "Creating interview timed out"
          );

          toast(toastMessage.title, { description: toastMessage.description });
        }
      }

      navigate("/generate", { replace: true });
    } catch (error) {
      console.log(error);
      toast.error("Error..", {
        description:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again later",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialData) {
      form.reset({
        position: initialData.position,
        description: initialData.description,
        experience: initialData.experience,
        techStack: initialData.techStack,
      });
    }
  }, [initialData, form]);

  return (
    <div className="w-full flex-col space-y-4">
      <CustomBreadCrumb
        breadCrumbPage={breadCrumpPage}
        breadCrumpItems={[{ label: "Mock Interviews", link: "/generate" }]}
      />

      <div className="mt-4 flex items-center justify-between w-full">
        <Headings title={title} isSubHeading />

        {initialData && (
          <Button size={"icon"} variant={"ghost"}>
            <Trash2 className="min-w-4 min-h-4 text-red-500" />
          </Button>
        )}
      </div>

      <Separator className="my-4" />

      <div className="my-6"></div>

      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full p-8 rounded-lg flex-col flex items-start justify-start gap-6 shadow-md "
        >
          <FormField
            control={form.control}
            name="position"
            render={({ field }) => (
              <FormItem className="w-full space-y-4">
                <div className="w-full flex items-center justify-between">
                  <FormLabel>Job Role / Job Position</FormLabel>
                  <FormMessage className="text-sm" />
                </div>
                <FormControl>
                  <Input
                    className="h-12"
                    disabled={loading}
                    placeholder="eg:- Full Stack Developer"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="w-full space-y-4">
                <div className="w-full flex items-center justify-between">
                  <FormLabel>Job Description</FormLabel>
                  <FormMessage className="text-sm" />
                </div>
                <FormControl>
                  <Textarea
                    className="h-12"
                    disabled={loading}
                    placeholder="eg:- describle your job role"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="experience"
            render={({ field }) => (
              <FormItem className="w-full space-y-4">
                <div className="w-full flex items-center justify-between">
                  <FormLabel>Years of Experience</FormLabel>
                  <FormMessage className="text-sm" />
                </div>
                <FormControl>
                  <Input
                    type="number"
                    className="h-12"
                    disabled={loading}
                    placeholder="eg:- 5 Years"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="techStack"
            render={({ field }) => (
              <FormItem className="w-full space-y-4">
                <div className="w-full flex items-center justify-between">
                  <FormLabel>Tech Stacks</FormLabel>
                  <FormMessage className="text-sm" />
                </div>
                <FormControl>
                  <Textarea
                    className="h-12"
                    disabled={loading}
                    placeholder="eg:- React, Typescript..."
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="w-full flex items-center justify-end gap-6">
            <Button
              type="reset"
              size={"sm"}
              variant={"outline"}
              disabled={isSubmitting || loading}
            >
              Reset
            </Button>
            <Button
              type="submit"
              size={"sm"}
              disabled={isSubmitting || !isValid || loading}
            >
              {loading ? (
                <Loader className="text-gray-50 animate-spin" />
              ) : (
                actions
              )}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};
