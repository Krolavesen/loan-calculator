import { Field } from '@base-ui/react/field'
import { NumberField } from '@base-ui/react/number-field'

interface CountFieldProps {
  label: string
  description?: string
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
}

export function CountField({
  label,
  description,
  value,
  onValueChange,
  min = 1,
  max,
  suffix,
}: CountFieldProps) {
  return (
    <Field.Root className="field">
      <NumberField.Root
        className="number-field"
        value={value}
        onValueChange={(next) => onValueChange(next ?? min)}
        min={min}
        max={max}
        step={1}
        snapOnStep
        locale="nb-NO"
      >
        <Field.Label className="field-label" render={<NumberField.ScrubArea />}>
          {label}
          <NumberField.ScrubAreaCursor />
        </Field.Label>
        <NumberField.Group className="number-group">
          <NumberField.Decrement className="stepper" aria-label={`Decrease ${label}`}>
            −
          </NumberField.Decrement>
          <NumberField.Input className="number-input" />
          {suffix ? <span className="number-suffix">{suffix}</span> : null}
          <NumberField.Increment className="stepper" aria-label={`Increase ${label}`}>
            +
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
      {description ? <Field.Description className="field-hint">{description}</Field.Description> : null}
    </Field.Root>
  )
}
