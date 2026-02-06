import React from 'react';
import './Dice.css';

interface DiceProps {
    value: number;
    rolling: boolean;
}

const FACE_ROTATIONS: Record<number, { x: number, y: number }> = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -180 },
    3: { x: 0, y: -90 },
    4: { x: 0, y: 90 },
    5: { x: -90, y: 0 },
    6: { x: 90, y: 0 },
};

export const Dice: React.FC<DiceProps> = ({ value, rolling }) => {
    // Track cumulative rotation to ensure we always spin forward
    // This prevents "rewinding" and allows continuous rolling feel
    const currentRot = React.useRef({ x: 0, y: 0, z: 0 });
    const [style, setStyle] = React.useState<React.CSSProperties>({});
    
    // Track if we are currently "mid-roll" to add extra chaotic spin
    const isRollingRef = React.useRef(false);

    React.useEffect(() => {
        if (rolling) {
            isRollingRef.current = true;
            // Rolling Phase: Continuous fast spin
            // Duration (1.5s) is longer than App.tsx timeout (1.2s) to ensure we never stop moving before the result comes
            // Linear curve ensures constant speed until interruption
            const extraSpins = 1; // Minimum spin for a single distinct throw
            currentRot.current.x += (extraSpins * 360) + (Math.random() * 90); 
            currentRot.current.y += (extraSpins * 360) + (Math.random() * 90); 
            currentRot.current.z += (extraSpins * 180) + (Math.random() * 90); 
            
            setStyle({
               transform: `translateZ(-30px) rotateX(${currentRot.current.x}deg) rotateY(${currentRot.current.y}deg) rotateZ(${currentRot.current.z}deg)`,
               transition: 'transform 1.5s linear' 
            });
        } else {
            // LANDING PHASE
            // Interrupting the rolling phase to snap to result
            
            const target = FACE_ROTATIONS[value] || FACE_ROTATIONS[1];
            
            const normalize = (deg: number) => {
                 const turns = Math.floor(deg / 360);
                 return (turns * 360);
            };

            // Add 1 extra full spin (360) + target face offset
            // Reduced padding from 720 to 360 for a more direct landing
            const padding = 360; 
            const nextX = normalize(currentRot.current.x) + padding + target.x;
            const nextY = normalize(currentRot.current.y) + padding + target.y;
            const nextZ = normalize(currentRot.current.z) + 0; 

            currentRot.current = { x: nextX, y: nextY, z: nextZ };
            isRollingRef.current = false;

            // Decelerate smoothly to the target (Bell curve tail)
            setStyle({
               transform: `translateZ(-30px) rotateX(${nextX}deg) rotateY(${nextY}deg) rotateZ(${nextZ}deg)`,
               transition: 'transform 0.8s cubic-bezier(0.1, 0.9, 0.2, 1)' 
            });
        }
    }, [value, rolling]);

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
            <div className="cube" style={style}>
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
