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

    const adContainerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && adContainerRef.current) {
            setTimeLeft(5);
            setCanSkip(false);
            
            // Clear previous content
            if (adContainerRef.current) {
                adContainerRef.current.innerHTML = '';
            }

            // Create an iframe to isolate the ad script
            // This prevents document.write() from breaking the React app and ensures unrelated styles don't leak.
            const iframe = document.createElement('iframe');
            iframe.style.width = '300px';
            iframe.style.height = '250px';
            iframe.style.border = 'none';
            iframe.style.overflow = 'hidden';
            iframe.title = "Advertisement";
            
            const adScript = `
                <html>
                    <head>
                        <style>body { margin: 0; display: flex; justify-content: center; align-items: center; background: #222; color: #fff; }</style>
                    </head>
                    <body>
                        <script type="text/javascript">
                            atOptions = {
                                'key' : '97bc5b1af447e104a19bfb5f55132d8c',
                                'format' : 'iframe',
                                'height' : 250,
                                'width' : 300,
                                'params' : {}
                            };
                        </script>
                        <script type="text/javascript" src="https://www.highperformanceformat.com/97bc5b1af447e104a19bfb5f55132d8c/invoke.js"></script>
                    </body>
                </html>
            `;

            adContainerRef.current.appendChild(iframe);
            
            // Write the ad script into the iframe
            const doc = iframe.contentWindow?.document;
            if (doc) {
                doc.open();
                doc.write(adScript);
                doc.close();
            }

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
            
            return () => {
                clearInterval(timer);
                // Cleanup is handled by React removing the DOM nodes, but we can explicit clear if needed
                if (adContainerRef.current) {
                     adContainerRef.current.innerHTML = '';
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
                
                <div className="ad-placeholder" ref={adContainerRef} style={{width: '320px', height: '270px', display:'flex', justifyContent:'center', alignItems:'center'}}>
                    {/* The iframe will be injected here */}
                    <div className="ad-text">
                        Loading Ad...
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
