import { Label } from '@/components/ui/label';
import { InlineTagManager } from '@/components/tags/InlineTagManager';
import { EntitySelect } from '@/components/projects/form/EntitySelect';
import { useCreateArtist } from '@/hooks/mutations/useArtistMutations';
import { useCreateCompany } from '@/hooks/mutations/useCompanyMutations';
import type { CreateArtistData } from '@/hooks/mutations/useArtistMutations';
import type { CreateCompanyData } from '@/hooks/mutations/useCompanyMutations';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ArtistDTO, CompanyDTO } from '@/services/types';
import type { ProjectFormValues } from '@/types/project';
import type { Tag } from '@/types/tag';
import { Section, type ProjectFormFieldChange } from './ProjectFormSectionPrimitives';

const buildCompanyPayload = (name: string, extras: Record<string, string>): CreateCompanyData => ({
  name,
  website_url: extras.website_url?.trim() || undefined,
});

const buildArtistPayload = (name: string): CreateArtistData => ({ name });

interface ProjectKitInfoSectionProps {
  formData: ProjectFormValues;
  companies: string[];
  artists: string[];
  isSubmitting: boolean;
  projectTags: Tag[];
  fieldErrors: ProjectFormFieldErrors;
  onFieldChange: ProjectFormFieldChange;
  onTagsChange: (tags: Tag[]) => void;
  onDraftCompany?: (data: CreateCompanyData) => void;
  onDraftArtist?: (data: CreateArtistData) => void;
}

export const ProjectKitInfoSection = ({
  formData,
  companies,
  artists,
  isSubmitting,
  projectTags,
  fieldErrors,
  onFieldChange,
  onTagsChange,
  onDraftCompany,
  onDraftArtist,
}: ProjectKitInfoSectionProps) => (
  <Section label="Kit info">
    <div className="space-y-4">
      <EntitySelect<CreateCompanyData, CompanyDTO>
        value={formData.company || ''}
        onChange={value => onFieldChange('company', value)}
        options={companies}
        disabled={isSubmitting}
        entityName="company"
        entityLabel="Company"
        placeholder="No company"
        presets={[]}
        emptyOptionLabel="No companies found (click + to add)"
        triggerButtonSize="sm"
        dialogTitle="Add New Company"
        dialogDescription="Enter the name and website URL of the diamond painting company you want to add to your list."
        submitLabel="Add Company"
        useCreateMutation={useCreateCompany}
        buildCreatePayload={buildCompanyPayload}
        createDraft={onDraftCompany}
        error={fieldErrors.company}
        extraFields={[
          {
            id: 'website_url',
            label: 'Website URL',
            placeholder: 'https://www.example.com',
            type: 'url',
          },
        ]}
      />

      <EntitySelect<CreateArtistData, ArtistDTO>
        value={formData.artist || ''}
        onChange={value => onFieldChange('artist', value)}
        options={artists}
        disabled={isSubmitting}
        entityName="artist"
        entityLabel="Artist"
        placeholder="No artist"
        presets={[]}
        emptyOptionLabel="No artists found (click + to add)"
        triggerButtonSize="icon"
        dialogTitle="Add New Artist"
        dialogDescription="Enter the name of the diamond painting artist you want to add to your list."
        submitLabel="Add Artist"
        useCreateMutation={useCreateArtist}
        buildCreatePayload={buildArtistPayload}
        createDraft={onDraftArtist}
        error={fieldErrors.artist}
      />

      <div className="space-y-2.5">
        <Label className="text-foreground text-sm font-medium">Tags</Label>
        <InlineTagManager
          initialTags={projectTags}
          onTagsChange={onTagsChange}
          className={isSubmitting ? 'pointer-events-none opacity-50' : ''}
        />
      </div>
    </div>
  </Section>
);
