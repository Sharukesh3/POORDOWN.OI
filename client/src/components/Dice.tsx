import React, { useEffect, useState } from 'react';
import './Dice.css';

interface DiceProps {
    value: number;
    rolling: boolean;
}

export const Dice: React.FC<DiceProps> = ({ value, rolling }) => {
    const [internalValue, setInternalValue] = useState(1);
    const [isScrambling, setIsScrambling] = useState(false);

    useEffect(() => {
        if (rolling) {
            setIsScrambling(true);
            // Scramble: Change face rapidly to simulate 3D tumbling
            const interval = setInterval(() => {
                setInternalValue(Math.floor(Math.random() * 6) + 1);
            }, 300);
            return () => clearInterval(interval);
        } else {
            setIsScrambling(false);
            setInternalValue(value);
        }
    }, [value, rolling]);

    // Use 'scrambling' class for fast transitions, removing it for slow landing
    const currentClass = isScrambling ? 'scrambling show-' + internalValue : 'show-' + internalValue;

    // Helper to render pips for a face
    const renderPips = (faceNumber: number) => {
        // We render 9 pips for the grid 3x3
        return (
            <div className={`pip-container face-${faceNumber}`}>
                {[...Array(9)].map((_, i) => (
                    <div key={i} className="pip"></div>
                ))}
            </div>
        );
    };

    return (
        <div className="scene">
            <div className={`cube ${currentClass}`}>
                <div className="cube__face cube__face--1">{renderPips(1)}</div>
                <div className="cube__face cube__face--2">{renderPips(2)}</div>
                <div className="cube__face cube__face--3">{renderPips(3)}</div>
                <div className="cube__face cube__face--4">{renderPips(4)}</div>
                <div className="cube__face cube__face--5">{renderPips(5)}</div>
                <div className="cube__face cube__face--6">{renderPips(6)}</div>
            </div>
        </div>
    );
};
