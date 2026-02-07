import React from 'react';

interface BankruptcyModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const BankruptcyModal: React.FC<BankruptcyModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div className="modal-header">
          <h2>⚠️ Declare Bankruptcy?</h2>
        </div>
        <div className="modal-body">
          <p style={{ color: '#a8a8c0', marginBottom: '20px' }}>
            Are you sure you want to declare bankruptcy?
          </p>
          <p style={{ color: '#e74c3c', fontWeight: 'bold', marginBottom: '20px' }}>
            You will lose all your assets and become a spectator.
          </p>
          <div className="modal-actions" style={{ justifyContent: 'center', gap: '15px' }}>
            <button 
                className="secondary-btn" 
                onClick={onCancel}
                style={{ padding: '10px 20px' }}
            >
                Cancel
            </button>
            <button 
                className="primary-btn" 
                onClick={onConfirm}
                style={{ background: '#e74c3c', border: 'none', padding: '10px 20px' }}
            >
                Confirm Bankruptcy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
