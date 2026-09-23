import type { ExtractionProvider } from "./provider";
import { MockExtractionProvider } from "./mock-provider";
import { DocAiProvider } from "./docai-provider";

/**
 * Provider registry. Default is the mock provider so the app runs with no keys. The real
 * `docai` provider is selected by env, and because both speak ProviderEvents, swapping never
 * touches the log, the SSE endpoint, or the UI (spec 0002 AC-7).
 */
type ProviderFactory = () => ExtractionProvider;

const defaultFactory: ProviderFactory = () => new MockExtractionProvider();
const providers: Record<string, ProviderFactory> = {
  mock: defaultFactory,
  docai: () => new DocAiProvider(),
};

export function registerProvider(name: string, factory: ProviderFactory): void {
  providers[name] = factory;
}

export function getExtractionProvider(): ExtractionProvider {
  const choice = process.env.EXTRACTION_PROVIDER ?? "mock";
  const factory = providers[choice] ?? defaultFactory;
  return factory();
}

export * from "./provider";
