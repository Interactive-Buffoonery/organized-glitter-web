import { DataImportExportSections } from '@/features/import-export/components/DataImportExportSections';

interface DataImportExportSettingsProps {
  profileLoading: boolean;
}

const DataImportExportSettings = ({ profileLoading }: DataImportExportSettingsProps) => {
  return <DataImportExportSections disabled={profileLoading} />;
};

export default DataImportExportSettings;
