import { type ComponentProps, splitProps, type ParentProps } from "solid-js"

export interface CardProps extends ComponentProps<"div"> {
  variant?: "normal" | "error" | "warning" | "success" | "info"
}
export interface CardContentProps extends ParentProps<ComponentProps<"div">> {}
export interface CardHeaderProps extends ParentProps<ComponentProps<"div">> {}
export interface CardTitleProps extends ParentProps<ComponentProps<"div">> {}
export interface CardDescriptionProps extends ParentProps<ComponentProps<"div">> {}

export function Card(props: CardProps) {
  const [split, rest] = splitProps(props, ["variant", "class", "classList"])
  return (
    <div
      {...rest}
      data-component="card"
      data-variant={split.variant || "normal"}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      {props.children}
    </div>
  )
}

export function CardContent(props: CardContentProps) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"])
  return (
    <div
      {...rest}
      data-component="card-content"
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </div>
  )
}

export function CardHeader(props: CardHeaderProps) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"])
  return (
    <div
      {...rest}
      data-component="card-header"
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </div>
  )
}

export function CardTitle(props: CardTitleProps) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"])
  return (
    <div
      {...rest}
      data-component="card-title"
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </div>
  )
}

export function CardDescription(props: CardDescriptionProps) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"])
  return (
    <div
      {...rest}
      data-component="card-description"
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </div>
  )
}
