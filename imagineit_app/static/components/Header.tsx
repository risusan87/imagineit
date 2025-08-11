
import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="w-full max-w-6xl text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                AI Image Studio
            </h1>
            <p className="mt-2 text-lg text-gray-400">Bring your creative visions to life with Stable Diffusion</p>
        </header>
    );
};

export default Header;
