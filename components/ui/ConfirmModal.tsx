'use client';

import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

export type ConfirmModalVariant = 'danger' | 'warning' | 'info';

// Map ConfirmModal variants to Button variants
const buttonVariantMap: Record<ConfirmModalVariant, 'primary' | 'secondary' | 'danger'> = {
  danger: 'danger',
  warning: 'secondary',
  info: 'primary'
};

export interface ConfirmModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when modal should close */
  onClose: () => void;
  /** Called when user confirms the action */
  onConfirm: () => void | Promise<void>;
  /** Modal title */
  title?: string;
  /** Confirmation message */
  message?: string;
  /** Text for confirm button */
  confirmText?: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Visual variant affecting colors */
  variant?: ConfirmModalVariant;
  /** Shows loading state on confirm button */
  loading?: boolean;
}

const iconColors: Record<ConfirmModalVariant, string> = {
  danger: 'text-red-400 bg-red-500/20',
  warning: 'text-amber-400 bg-amber-500/20',
  info: 'text-blue-400 bg-blue-500/20'
};

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false
}: ConfirmModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
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
            variant={buttonVariantMap[variant]}
            onClick={handleConfirm}
            disabled={loading}
            loading={loading}
            className="min-w-[100px]"
          >
            {loading ? 'Processing...' : confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${iconColors[variant]}`} aria-hidden="true">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-dark-200 leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
