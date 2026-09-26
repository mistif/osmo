import React from 'react';
import { Geist, Geist_Mono } from "next/font/google";

export default function page() {
  return (
    <div className="font-mono">
        <div className="py-20 mx-auto text-center .w-full bg-gray-200">
    <h1 className="font-bold text-3xl">About</h1>
    </div>
<div className="py-4 px-4">
    <h2 className="font-bold py-5">What does this agent do?</h2>
    <p>This agent assists with financial literacy. It takes your money and makes even more money! How amazing is that? In addition, it does your taxes, makes you a five year plan, and reads your children a bedtime story.</p>
    </div>
    <div className="py-4 px-4 bg-gray-400 text-right my-5">
        <h2 className="font-bold py-5">About the creators</h2>
        <p>This agent was created by five coding students looking for prospective clients. The best way to contact them is to stand on a mountain and shout swadadigi as loud as you can. They have no next projects. This is the only one.</p>
    </div>
    <div className="py-4 px-4 text-center">

    <h2 className="font-bold py-5">Reviews</h2>
    <p className="my-2"><q>This agent saved my life!</q> - Dvir</p>
    <p><q>I would trust this agent with anything. It makes money grow on trees, literally!</q> - Anonymous</p>

    </div>

    </div>
  )
}