import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', danger }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-text-muted text-sm mb-6">{message}</p>
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1 text-sm py-2.5">
          Cancel
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`flex-1 font-medium rounded-xl px-6 py-2.5 text-sm active:scale-[0.98] transition-all ${
            danger ? 'bg-danger text-white' : 'btn-primary'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
