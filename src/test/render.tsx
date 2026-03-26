import {
  render as rtlRender,
  type RenderOptions,
} from "@testing-library/react";
import type { ComponentType, PropsWithChildren, ReactElement } from "react";

type ProviderComponent = ComponentType<PropsWithChildren>;

export function composeProviders(
  ...providers: ProviderComponent[]
): ProviderComponent {
  return function ComposedProviders({ children }) {
    return providers.reduceRight(
      (acc, Provider) => <Provider>{acc}</Provider>,
      children,
    );
  };
}

interface RenderWithProvidersOptions
  extends Omit<RenderOptions, "wrapper"> {
  wrapper?: ProviderComponent;
}

export function renderWithProviders(
  ui: ReactElement,
  { wrapper: Wrapper, ...options }: RenderWithProvidersOptions = {},
) {
  return rtlRender(ui, {
    wrapper: Wrapper,
    ...options,
  });
}

export * from "@testing-library/react";
