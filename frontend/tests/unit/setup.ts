import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Mock TubePlayer globally for all frontend tests
vi.mock('@jburnhams/tube-ts', () => {
    return {
        TubePlayer: vi.fn().mockImplementation(() => {
            return {
                initialize: vi.fn().mockResolvedValue(undefined),
                loadVideo: vi.fn().mockResolvedValue(undefined),
                destroy: vi.fn(),
            };
        }),
    };
});
