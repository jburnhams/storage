import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { YoutubeViewer } from './YoutubeViewer';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { YoutubeChannel } from '../types';

// Mock fetch
const globalFetch = vi.fn();
global.fetch = globalFetch;

describe('YoutubeViewer Sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockChannel: YoutubeChannel = {
        youtube_id: 'UC_TEST',
        title: 'Test Channel',
        description: 'Desc',
        custom_url: 'test',
        thumbnail_url: 'thumb',
        published_at: '2020-01-01',
        statistics: JSON.stringify({ videoCount: '10' }),
        raw_json: '{}',
        created_at: '2023-01-01',
        updated_at: '2023-01-01'
    };

    it('renders sync button for channels', async () => {
        // Mock successful channel fetch
        globalFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockChannel
        });

        render(<YoutubeViewer />);

        // Simulate searching
        fireEvent.change(screen.getByPlaceholderText(/Video ID/), { target: { value: 'UC_TEST' } });
        // Switch to channel mode first
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'channel' } });
        fireEvent.change(screen.getByPlaceholderText(/Channel ID/), { target: { value: 'UC_TEST' } });
        fireEvent.click(screen.getByText('Fetch'));

        await waitFor(() => screen.getByText('Test Channel'));

        expect(screen.getByText('Sync Videos')).toBeDefined();
    });

    it('performs sync loop and updates progress', async () => {
        // 1. Fetch Channel
        globalFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockChannel
        });

        render(<YoutubeViewer />);

        // Search
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'channel' } });
        fireEvent.change(screen.getByPlaceholderText(/Channel ID/), { target: { value: 'UC_TEST' } });
        fireEvent.click(screen.getByText('Fetch'));

        await waitFor(() => screen.getByText('Sync Videos'));

        // 2. Click Sync - Sequence of mock responses
        // Response 1: In progress
        globalFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                count: 50,
                range_start: '2023-01-01',
                range_end: '2023-02-01',
                sample_video: { title: 'Video 1', published_at: '2023-01-05', thumbnail_url: 'vthumb' },
                is_complete: false
            })
        });

        // Response 2: Complete
        globalFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                count: 10,
                range_start: '2020-01-01', // Reached creation
                range_end: '2020-02-01',
                sample_video: { title: 'Old Video', published_at: '2020-01-05', thumbnail_url: 'vthumb' },
                is_complete: true
            })
        });

        fireEvent.click(screen.getByText('Sync Videos'));

        await waitFor(() => screen.getByText('Syncing...'));

        // Check progress update 1
        await waitFor(() => screen.getByText('Total Fetched This Run: 50'));
        await waitFor(() => screen.getByText('Video 1 (1/5/2023)'));

        // Check completion (loop continues automatically)
        await waitFor(() => screen.getByText('Total Fetched This Run: 60')); // 50 + 10
        await waitFor(() => screen.getByText('Sync Complete! All videos up to channel creation fetched.'));

        // Should have refreshed channel data (another fetch called)
        // We mocked 1 initial, 2 syncs. The code calls handleSearch again at end.
        // We didn't mock that 4th call, so verify calls.
        expect(globalFetch).toHaveBeenCalledTimes(4); // 1 search + 2 syncs + 1 refresh
    });
});
