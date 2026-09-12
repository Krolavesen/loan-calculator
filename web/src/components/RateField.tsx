import { Field } from '@base-ui/react/field'
import { NumberField } from '@base-ui/react/number-field'

interface RateFieldProps {
  label: string
  description?: string
  /** Rate as a decimal, e.g. 0.0492. */
  value: number
  /** Called with the new rate as a decimal. */
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

/** A percentage input that stores its value as a decimal. */
export function RateField({
  label,
  description,
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.001,
}: RateFieldProps) {
  return (
    <Field.Root className="field">
      <NumberField.Root
        className="number-field"
        value={value}
        onValueChange={(next) => onValueChange(next ?? 0)}
        min={min}
        max={max}
        step={step}
        smallStep={step / 10}
        largeStep={step * 10}
        locale="nb-NO"
        format={{ style: 'percent', maximumFractionDigits: 2 }}
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
          <NumberField.Increment className="stepper" aria-label={`Increase ${label}`}>
            +
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
      {description ? <Field.Description className="field-hint">{description}</Field.Description> : null}
    </Field.Root>
  )
}
