import SegmentedControl from '@/components/shared/SegmentedControl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ProjectFormValues } from '@/types/project';
import {
  FieldError,
  Section,
  type NumberInputHandlers,
  type ProjectFormFieldChange,
} from './ProjectFormSectionPrimitives';
import { getErrorId } from './projectFormSectionUtils';

interface ProjectSpecsSectionProps {
  formData: ProjectFormValues;
  isSubmitting: boolean;
  fieldErrors: ProjectFormFieldErrors;
  totalDiamondsProps: NumberInputHandlers;
  colorCountProps: NumberInputHandlers;
  widthProps: NumberInputHandlers;
  heightProps: NumberInputHandlers;
  onFieldChange: ProjectFormFieldChange;
}

export const ProjectSpecsSection = ({
  formData,
  isSubmitting,
  fieldErrors,
  totalDiamondsProps,
  colorCountProps,
  widthProps,
  heightProps,
  onFieldChange,
}: ProjectSpecsSectionProps) => (
  <Section label="Specs">
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label className="text-foreground text-sm font-medium">Type of kit</Label>
        <SegmentedControl
          variant="glass"
          value={formData.kitCategory || 'full'}
          onValueChange={value => onFieldChange('kitCategory', value)}
          options={[
            { value: 'full', label: 'Full Sized' },
            { value: 'mini', label: 'Mini' },
          ]}
          disabled={isSubmitting}
        />
        <FieldError field="kitCategory" message={fieldErrors.kitCategory} />
      </div>

      <div className="space-y-2">
        <Label className="text-foreground text-sm font-medium">Drill shape</Label>
        <SegmentedControl
          variant="glass"
          value={(formData.drillShape as 'round' | 'square' | undefined) || 'round'}
          onValueChange={value => onFieldChange('drillShape', value)}
          options={[
            { value: 'round', label: 'Round' },
            { value: 'square', label: 'Square' },
          ]}
          disabled={isSubmitting}
        />
        <FieldError field="drillShape" message={fieldErrors.drillShape} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="totalDiamonds" className="text-foreground text-sm font-medium">
          Total diamonds
        </Label>
        <Input
          id="totalDiamonds"
          type="number"
          min="0"
          value={formData.totalDiamonds || ''}
          {...totalDiamondsProps}
          placeholder="Enter total diamonds"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.totalDiamonds ? 'true' : 'false'}
          aria-describedby={fieldErrors.totalDiamonds ? getErrorId('totalDiamonds') : undefined}
        />
        <FieldError field="totalDiamonds" message={fieldErrors.totalDiamonds} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="colorCount" className="text-foreground text-sm font-medium">
          # of colors
        </Label>
        <Input
          id="colorCount"
          type="number"
          min="1"
          step="1"
          value={formData.colorCount || ''}
          {...colorCountProps}
          placeholder="Enter # of colors"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.colorCount ? 'true' : 'false'}
          aria-describedby={fieldErrors.colorCount ? getErrorId('colorCount') : undefined}
        />
        <FieldError field="colorCount" message={fieldErrors.colorCount} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="width" className="text-foreground text-sm font-medium">
          Width (cm)
        </Label>
        <Input
          id="width"
          type="number"
          min="0"
          step="0.1"
          value={formData.width || ''}
          {...widthProps}
          placeholder="Enter width"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.width ? 'true' : 'false'}
          aria-describedby={fieldErrors.width ? getErrorId('width') : undefined}
        />
        <FieldError field="width" message={fieldErrors.width} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="height" className="text-foreground text-sm font-medium">
          Height (cm)
        </Label>
        <Input
          id="height"
          type="number"
          min="0"
          step="0.1"
          value={formData.height || ''}
          {...heightProps}
          placeholder="Enter height"
          disabled={isSubmitting}
          aria-invalid={fieldErrors.height ? 'true' : 'false'}
          aria-describedby={fieldErrors.height ? getErrorId('height') : undefined}
        />
        <FieldError field="height" message={fieldErrors.height} />
      </div>
    </div>
  </Section>
);
