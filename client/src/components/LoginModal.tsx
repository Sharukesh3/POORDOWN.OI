import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginModal.css';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
    const { loginGoogle, loginGuest, loading } = useAuth();
    const [error, setError] = React.useState('');

    if (!isOpen) return null;

    const handleGoogleLogin = async () => {
        try {
            await loginGoogle();
            onLoginSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to sign in with Google');
        }
    };

    const handleGuestLogin = async () => {
        try {
            await loginGuest();
            onLoginSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to continue as guest');
        }
    };

    return (
        <div className="login-modal-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="login-modal-content">
                <h2 className="login-modal-title">Sign In Required</h2>
                
                {error && <div style={{color: 'red', marginBottom: '10px'}}>{error}</div>}

                <button className="login-btn-google" onClick={handleGoogleLogin} disabled={loading}>
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20"/>
                    Sign in with Google
                </button>

                <div className="login-divider">
                    <span>OR</span>
                </div>

                <button className="login-btn-guest" onClick={handleGuestLogin} disabled={loading}>
                    Continue as Guest
                </button>

                <div className="guest-warning">
                    <strong>Guest Limitation:</strong> Guests can save max 1 map on this browser. Save your progress forever by signing in!
                </div>
            </div>
        </div>
    );
};
