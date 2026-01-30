/**
 * Form UI Component
 *
 * A comprehensive form component system that integrates react-hook-form
 * with Radix UI primitives for accessible, validated forms. This module
 * provides the glue between react-hook-form's validation engine and
 * the shadcn/ui component library.
 *
 * Marked as "use client" because react-hook-form requires React context
 * providers and hooks that only work in client components.
 *
 * Architecture:
 * - Form: Top-level provider wrapping react-hook-form's FormProvider
 * - FormField: Connects a react-hook-form Controller to the FormFieldContext
 * - FormItem: Groups label, control, description, and message together
 * - FormLabel: Accessible label linked to the form control via htmlFor
 * - FormControl: Slot that injects aria attributes into the child input
 * - FormDescription: Helper text linked via aria-describedby
 * - FormMessage: Error message linked via aria-describedby
 *
 * The context chain (Form -> FormField -> FormItem) propagates the field
 * name and generated IDs down to all child components, enabling automatic
 * aria attribute wiring without manual prop drilling.
 */
"use client"

import * as React from "react"
import type * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/**
 * Form root component.
 * Re-exports react-hook-form's FormProvider with a type assertion to
 * satisfy TypeScript's strict typing. The FormProvider makes the form
 * methods (register, handleSubmit, etc.) available to all child components
 * via React context, eliminating prop drilling for deeply nested fields.
 */
const Form = FormProvider as unknown as React.ForwardRefExoticComponent<Record<string, unknown>>

/**
 * Context type for tracking which field a FormField is managing.
 * The field name is used by child components (FormLabel, FormControl, etc.)
 * to look up field state (errors, dirty, touched) from react-hook-form.
 */
type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName
}

/**
 * React context for the current form field.
 * Initialized with an empty object and populated by FormField.
 * Used by useFormField hook to access the field name.
 */
const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

/**
 * FormField component.
 * Wraps react-hook-form's Controller with a context provider that
 * makes the field name available to child components. This is the key
 * integration point between react-hook-form and the UI components.
 *
 * Generic type parameters allow TypeScript to validate field names
 * against the form's type schema, catching typos at compile time.
 */
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

/**
 * Custom hook to access form field state and generated IDs.
 *
 * Returns:
 * - id: The auto-generated unique ID for this form item
 * - name: The field name from react-hook-form
 * - formItemId: ID for the form control element (used by label's htmlFor)
 * - formDescriptionId: ID for the description element (used by aria-describedby)
 * - formMessageId: ID for the error message element (used by aria-describedby)
 * - ...fieldState: error, isDirty, isTouched, isValidating from react-hook-form
 *
 * Throws if used outside of FormField or Form contexts, providing clear
 * error messages for debugging incorrect component nesting.
 */
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)

  // Validate fieldContext exists before using it in useFormState.
  // This prevents "Cannot read properties of undefined (reading '_formState')" error
  // that would occur if useFormField is called outside a FormField wrapper.
  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const formContext = useFormContext()
  // Validate formContext exists before destructuring.
  // This prevents null reference error when the component tree is not
  // wrapped in a FormProvider (Form) component.
  if (!formContext) {
    throw new Error("useFormField should be used within <Form>")
  }

  const { getFieldState } = formContext
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

/**
 * Context type for tracking the auto-generated ID of a FormItem.
 * This ID is used to create deterministic, unique IDs for the
 * form control, description, and message elements within each item.
 */
type FormItemContextValue = {
  id: string
}

/**
 * React context for the current form item's generated ID.
 * Initialized with an empty object and populated by FormItem.
 */
const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

/**
 * FormItem component.
 * Groups a label, form control, description, and error message together.
 * Generates a unique ID using React.useId() which is used as the base
 * for all child element IDs, ensuring proper aria attribute connections.
 *
 * Uses CSS Grid with gap-2 for consistent spacing between child elements.
 */
function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        id={id}
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  )
}

/**
 * FormLabel component.
 * An accessible label that is automatically linked to its form control
 * via the htmlFor attribute. Shows destructive (red) text color when
 * the associated field has a validation error.
 *
 * @param htmlFor - Optional override for the htmlFor attribute.
 *   When not provided, uses the auto-generated formItemId.
 *   This allows custom htmlFor values in tests or complex layouts
 *   where the control ID doesn't follow the standard pattern.
 */
function FormLabel({
  className,
  htmlFor,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField()

  // Use custom htmlFor if provided, otherwise use formItemId.
  // This allows the htmlFor prop to be overridden by tests or custom usage
  // while maintaining the default auto-linking behavior.
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={htmlFor ?? formItemId}
      {...props}
    />
  )
}

/**
 * FormControl component.
 * A Slot that merges accessibility attributes onto its child input element:
 * - id: Links to the label's htmlFor for click-to-focus behavior
 * - aria-describedby: Links to description and/or error message
 * - aria-invalid: Set when the field has a validation error
 *
 * Using Radix Slot instead of a wrapper div prevents adding extra DOM
 * nodes that could interfere with input styling or layout.
 */
function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formDescriptionId, formMessageId, formItemId } = useFormField()

  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
}

/**
 * FormDescription component.
 * Helper text that provides additional context for a form field.
 * Linked to the form control via aria-describedby for screen reader
 * users to hear the description when the field receives focus.
 * Uses muted color and smaller text for visual hierarchy.
 */
function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField()

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

/**
 * FormMessage component.
 * Displays validation error messages for the associated field.
 * Automatically reads the error message from react-hook-form's field state.
 * Falls back to children content when no error is present, allowing
 * static messages to be displayed.
 *
 * Returns null when there is no error and no children, avoiding empty
 * DOM nodes that could affect layout spacing.
 */
function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField()
  /** Use error message from react-hook-form, or fall back to children prop */
  const body = error ? String(error?.message ?? "") : props.children

  /** Return null to avoid rendering an empty element when there is no message */
  if (!body) {
    return null
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  )
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
