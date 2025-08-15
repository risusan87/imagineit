
import React, { useState, useRef, useEffect } from 'react';

interface BackendSettingsPanelProps {
    backendMode: 'combined' | 'dedicated';
    setBackendMode: (mode: 'combined' | 'dedicated') => void;
    dedicatedDomain: string;
    setDedicatedDomain: (domain: string) => void;
    onClose: () => void;
    settingsButtonRef: React.RefObject<HTMLButtonElement>;
}

const BackendSettingsPanel: React.FC<BackendSettingsPanelProps> = ({
    backendMode, setBackendMode, dedicatedDomain, setDedicatedDomain, onClose, settingsButtonRef
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
    const [verificationError, setVerificationError] = useState<string | null>(null);

    const verifyConnection = async (domain: string) => {
        const trimmedDomain = domain.trim();
        if (!trimmedDomain) {
            setVerificationStatus('idle');
            setVerificationError(null);
            return;
        }

        if (!(trimmedDomain.startsWith('http://') || trimmedDomain.startsWith('https://'))) {
            setVerificationStatus('error');
            setVerificationError('URL must start with http:// or https://');
            return;
        }

        setVerificationStatus('verifying');
        setVerificationError(null);

        try {
            const response = await fetch(`${trimmedDomain.replace(/\/$/, '')}/api/v1/status`);
            if (response.ok) {
                setVerificationStatus('success');
            } else {
                setVerificationStatus('error');
                setVerificationError(`Verification failed: Status ${response.status}`);
            }
        } catch (e) {
            setVerificationStatus('error');
            setVerificationError('Connection failed. Check URL and CORS settings.');
            console.error("Connection verification failed:", e);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                panelRef.current &&
                !panelRef.current.contains(event.target as Node) &&
                settingsButtonRef.current &&
                !settingsButtonRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose, settingsButtonRef]);

    useEffect(() => {
        if (backendMode === 'dedicated') {
            verifyConnection(dedicatedDomain);
        } else {
            setVerificationStatus('idle');
            setVerificationError(null);
        }
    }, [backendMode]);


    const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDedicatedDomain(e.target.value);
        setVerificationStatus('idle');
        setVerificationError(null);
    };

    const handleDomainBlur = () => {
        verifyConnection(dedicatedDomain);
    };

    return (
        <div ref={panelRef} className="absolute top-full right-0 mt-2 w-80 bg-gray-800 rounded-lg shadow-2xl border border-gray-700 z-50 p-6 text-left">
            <h3 className="text-lg font-semibold text-white mb-4">Backend Settings</h3>
            <div className="space-y-4">
                <p className="text-sm text-gray-400">Choose how the app communicates with the backend API.</p>
                <div className="space-y-2">
                    <label className="flex items-center p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors">
                        <input
                            type="radio"
                            name="backend-mode"
                            value="combined"
                            checked={backendMode === 'combined'}
                            onChange={() => setBackendMode('combined')}
                            className="h-4 w-4 text-purple-500 bg-gray-900 border-gray-600 focus:ring-purple-600"
                        />
                        <span className="ml-3 text-sm font-medium text-gray-200">Combined</span>
                    </label>
                    <label className="flex items-center p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors">
                        <input
                            type="radio"
                            name="backend-mode"
                            value="dedicated"
                            checked={backendMode === 'dedicated'}
                            onChange={() => setBackendMode('dedicated')}
                            className="h-4 w-4 text-purple-500 bg-gray-900 border-gray-600 focus:ring-purple-600"
                        />
                        <span className="ml-3 text-sm font-medium text-gray-200">Dedicated Domain</span>
                    </label>
                </div>
                {backendMode === 'dedicated' && (
                    <div className="pt-2">
                        <label htmlFor="dedicated-domain" className="block text-sm font-medium text-gray-300 mb-2">
                            API Domain
                        </label>
                        <div className="relative">
                            <input
                                id="dedicated-domain"
                                type="text"
                                className="w-full bg-gray-900/50 border-gray-600 rounded-lg p-3 pr-10 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-200"
                                value={dedicatedDomain}
                                onChange={handleDomainChange}
                                onBlur={handleDomainBlur}
                                placeholder="https://your-api.com"
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                {verificationStatus === 'verifying' && (
                                    <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {verificationStatus === 'success' && (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                )}
                                {verificationStatus === 'error' && (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                        </div>
                        <div className="text-xs mt-2 h-4">
                            {verificationStatus === 'verifying' && <p className="text-gray-400">Verifying connection...</p>}
                            {verificationStatus === 'success' && <p className="text-green-400">Connection successful!</p>}
                            {verificationStatus === 'error' && <p className="text-red-400">{verificationError}</p>}
                            {verificationStatus === 'idle' && <p className="text-gray-500">Enter the full URL of your backend server.</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


interface HeaderProps {
    backendMode: 'combined' | 'dedicated';
    setBackendMode: (mode: 'combined' | 'dedicated') => void;
    dedicatedDomain: string;
    setDedicatedDomain: (domain: string) => void;
}

const Header: React.FC<HeaderProps> = ({ backendMode, setBackendMode, dedicatedDomain, setDedicatedDomain }) => {
    const [showSettings, setShowSettings] = useState(false);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);

    return (
        <header className="w-full max-w-6xl text-center relative">
            <div className="flex justify-center items-center relative">
                <div className="text-center">
                        <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                        AI Image Studio
                    </h1>
                    <p className="mt-2 text-lg text-gray-400">Bring your creative visions to life with Stable Diffusion</p>
                </div>

                <button
                    ref={settingsButtonRef}
                    onClick={() => setShowSettings(prev => !prev)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full text-gray-400 hover:bg-gray-700/50 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500"
                    aria-label="Open backend settings"
                    aria-haspopup="true"
                    aria-expanded={showSettings}
                >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                </button>
            </div>
                {showSettings && (
                    <BackendSettingsPanel
                        backendMode={backendMode}
                        setBackendMode={setBackendMode}
                        dedicatedDomain={dedicatedDomain}
                        setDedicatedDomain={setDedicatedDomain}
                        onClose={() => setShowSettings(false)}
                        settingsButtonRef={settingsButtonRef}
                    />
                )}
        </header>
    );
};

export default Header;
