import React, { useEffect, useState } from 'react';
import './AdModal.css';

interface AdModalProps {
    isOpen: boolean;
    onComplete: () => void;
    message?: string;
}

export const AdModal: React.FC<AdModalProps> = ({ isOpen, onComplete, message = "Watch this ad to continue" }) => {
    const [timeLeft, setTimeLeft] = useState(5);
    const [canSkip, setCanSkip] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setTimeLeft(5);
            setCanSkip(false);
            
            // Inject Adsterra Script
            const script = document.createElement('script');
            script.src = "//pl28669975.effectivegatecpm.com/d2/c2/9e/d2c29e458b524bfbbe8187f38deacc7f.js";
            script.async = true;
            document.body.appendChild(script);

            const timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        setCanSkip(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            
            // Cleanup script on close? usually ads need to stay to count, but repeated opens might duplicate.
            // Let's remove it on unmount to prevent head clutter, though the ad instance might remain.
            return () => {
                clearInterval(timer);
                try {
                    document.body.removeChild(script);
                } catch (e) {
                    // Ignore if already removed
                }
            };
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="ad-modal-overlay">
            <div className="ad-modal-content">
                <h2>📢 Sponsored Message</h2>
                <p>{message}</p>
                
                <div className="ad-placeholder">
                    <div className="ad-text">
                        📢 Advertisement Loading...
                        <span style={{fontSize: '0.8rem', marginTop: '10px', display: 'block', color:'#888'}}>
                            Please disable ad-blocker to support us!
                        </span>
                    </div>
                </div>

                <div className="ad-timer">
                    {canSkip ? "Thanks for watching!" : `Reward in ${timeLeft}s...`}
                </div>

                <button 
                    className="ad-btn" 
                    onClick={onComplete} 
                    disabled={!canSkip}
                >
                    {canSkip ? "Continue" : "Please Wait..."}
                </button>
            </div>
        </div>
    );
};
