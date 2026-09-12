import { Field } from '@base-ui/react/field'
import { Switch } from '@base-ui/react/switch'

interface ToggleFieldProps {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function ToggleField({ label, description, checked, onCheckedChange }: ToggleFieldProps) {
  return (
    <Field.Root className="field toggle-field">
      <Field.Label className="toggle-label">
        <Switch.Root className="switch" checked={checked} onCheckedChange={onCheckedChange}>
          <Switch.Thumb className="switch-thumb" />
        </Switch.Root>
        {label}
      </Field.Label>
      {description ? <Field.Description className="field-hint">{description}</Field.Description> : null}
    </Field.Root>
  )
}
