import OfficialDepartmentReport from './OfficialDepartmentReport';

const CertificateModal = ({ open = true, ...props }) => {
  if (!open) return null;
  return <OfficialDepartmentReport {...props} />;
};

export default CertificateModal;
