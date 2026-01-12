import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CollectionsManager } from "../../src/components/CollectionsManager";
import { UserResponse } from "../../src/types";

describe("CollectionsManager", () => {
    const mockUser: UserResponse = {
        id: 1,
        email: "test@example.com",
        name: "Test User",
        profile_picture: null,
        is_admin: false,
        created_at: "",
        updated_at: "",
        last_login_at: ""
    };

    const mockCollections = [
        {
            id: 123,
            name: "Test Collection",
            description: "Desc",
            secret: "secret-123",
            created_at: "",
            updated_at: "",
            metadata: null,
            origin: null,
            user_id: 1
        }
    ];

    beforeEach(() => {
        global.fetch = vi.fn();
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn(),
            },
        });
        window.alert = vi.fn();
    });

    it("should copy the correct share link format to clipboard", async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockCollections,
        });

        render(<CollectionsManager user={mockUser} />);

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.getByText("Test Collection")).toBeInTheDocument();
        });

        // Find Share Link button
        const shareBtn = screen.getByText("Share Link");
        fireEvent.click(shareBtn);

        // Verify clipboard URL
        const expectedUrl = `${window.location.origin}/api/collections/123?secret=secret-123`;
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedUrl);
        expect(window.alert).toHaveBeenCalledWith("Public JSON link copied!");
    });
});
