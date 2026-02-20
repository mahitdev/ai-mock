import React from 'react';
import WebcamView from './WebcamView';
import { Lightbulb } from 'lucide-react';

function Dashboard() {
    return (
        <div className='px-4 py-6 sm:px-6 md:px-10 md:py-10'>
            <h2 className='font-bold text-xl sm:text-2xl'>Let's Get Started</h2>
            
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mt-5'>
                
                {/* Left Side: Information & Instructions */}
                <div className='flex flex-col gap-5'>
                    <div className='flex flex-col p-5 rounded-lg border gap-5 shadow-sm bg-white'>
                        <h2 className='text-base sm:text-lg'><strong>Job Role/Job Position:</strong> Full Stack Developer</h2>
                        <h2 className='text-base sm:text-lg'><strong>Job Description/Tech Stack:</strong> React, Node, Express, MongoDB</h2>
                        <h2 className='text-base sm:text-lg'><strong>Years of Experience:</strong> 2 Years</h2>
                    </div>

                    <div className='p-5 border rounded-lg border-yellow-300 bg-yellow-50'>
                        <h2 className='flex gap-2 items-center text-yellow-700 text-sm sm:text-base'>
                            <Lightbulb className='w-4 h-4 sm:w-5 sm:h-5 shrink-0' /> <strong>Information</strong>
                        </h2>
                        <p className='mt-2 text-sm sm:text-base text-yellow-600'>
                            Enable Web Camera and Microphone to start your AI Mock Interview. 
                            It has 5 questions which you can answer and at the last you will get the report 
                            based on your answers. <strong>Note:</strong> We never record your video.
                        </p>
                    </div>
                </div>

                {/* Right Side: Webcam Section */}
                <div>
                    <WebcamView />
                </div>

            </div>
        </div>
    );
}

export default Dashboard;
