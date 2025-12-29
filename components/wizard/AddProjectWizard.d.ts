export interface AddProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

declare const AddProjectWizard: React.FC<AddProjectWizardProps>;
export default AddProjectWizard;
