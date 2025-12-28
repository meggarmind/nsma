'use client';

import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * Confirmation modal for destructive actions
 * Replaces browser confirm() with styled modal
 */
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  loading = false
}) {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  const iconColors = {
    danger: 'text-red-400 bg-red-500/20',
    warning: 'text-amber-400 bg-amber-500/20',
    info: 'text-blue-400 bg-blue-500/20'
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={loading}
            className="min-w-[100px]"
          >
            {loading ? 'Processing...' : confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${iconColors[variant]}`}>
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-dark-200 leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
