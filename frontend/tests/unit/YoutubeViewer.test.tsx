import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { YoutubeViewer } from '../../src/components/YoutubeViewer';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { YoutubeChannel } from '../../src/types';
import { TubePlayer } from '@jburnhams/tube-ts';

// Mock fetch
const globalFetch = vi.fn();
global.fetch = globalFetch;

describe('YoutubeViewer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockVideo = {
        youtube_id: 'vid1',
        title: 'Test Video',
        description: 'Desc',
        published_at: '2023-01-01',
        channel_id: 'chan1',
        thumbnail_url: 'thumb.jpg',
        duration: '10:00',
        raw_json: '{}',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        view_count: 1000,
        like_count: 100,
        comment_count: 50
    };

    const mockChannels = {
        channels: [
            { youtube_id: 'chan1', title: 'Test Channel 1' },
            { youtube_id: 'chan2', title: 'Test Channel 2' }
        ]
    };

    it('switches between ID and Search modes', async () => {
         // Mock for the channel fetch that happens on mode switch
         globalFetch.mockResolvedValue({
            ok: true,
            json: async () => mockChannels
        });

        render(<YoutubeViewer />);
        expect(screen.getByPlaceholderText(/Video ID/)).toBeDefined();

        fireEvent.click(screen.getByText('Search Database'));

        // Wait for the effect to fire and fetch channels to avoid unhandled rejection/error logging
        await waitFor(() => expect(globalFetch).toHaveBeenCalledWith('/api/youtube/channels'));

        expect(screen.getByPlaceholderText('Search videos by title...')).toBeDefined();

        fireEvent.click(screen.getByText('Fetch ID'));
        expect(screen.getByPlaceholderText(/Video ID/)).toBeDefined();
    });

    it('searches for videos and displays results in table', async () => {
        // Setup mocks for channels call (called on mount of search mode) AND search call
        globalFetch
            .mockImplementation((url) => {
                if (url.toString().includes('/channels')) {
                     return Promise.resolve({
                        ok: true,
                        json: async () => mockChannels
                     });
                }
                if (url.toString().includes('/videos')) {
                     return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            videos: [mockVideo],
                            limit: 10,
                            offset: 0
                        })
                    });
                }
                return Promise.reject(new Error('Unknown URL: ' + url));
            });

        render(<YoutubeViewer />);
        fireEvent.click(screen.getByText('Search Database'));

        // Wait for channels fetch
        await waitFor(() => expect(globalFetch).toHaveBeenCalledWith('/api/youtube/channels'));

        const searchInput = screen.getByPlaceholderText('Search videos by title...');
        fireEvent.change(searchInput, { target: { value: 'Test' } });
        fireEvent.click(screen.getByText('Search'));

        await waitFor(() => screen.getByText('Test Video'));
        expect(screen.getByText('1,000')).toBeDefined(); // Views formatted
        expect(screen.getByText('chan1')).toBeDefined();

        // Verify fetch params
        const calls = globalFetch.mock.calls.filter(c => c[0].toString().includes('/videos'));
        const url = new URL(calls[0][0], 'http://localhost');
        expect(url.pathname).toBe('/api/youtube/videos');
        expect(url.searchParams.get('title_contains')).toBe('Test');
        expect(url.searchParams.get('limit')).toBe('10');
        expect(url.searchParams.get('offset')).toBe('0');
    });

    it('navigates to video detail when clicking search result', async () => {
        // Mock responses
        globalFetch.mockImplementation((url) => {
             if (url.toString().includes('/channels')) {
                 return Promise.resolve({ ok: true, json: async () => mockChannels });
             }
             if (url.toString().includes('/videos')) {
                 return Promise.resolve({
                    ok: true,
                    json: async () => ({ videos: [mockVideo], limit: 10, offset: 0 })
                });
             }
             if (url.toString().includes('/api/youtube/video/vid1')) {
                 return Promise.resolve({
                     ok: true,
                     json: async () => mockVideo
                 });
             }
             return Promise.reject(new Error('Unknown URL: ' + url));
        });

        render(<YoutubeViewer />);
        fireEvent.click(screen.getByText('Search Database'));
        await waitFor(() => expect(globalFetch).toHaveBeenCalledWith('/api/youtube/channels'));

        // Search
        fireEvent.click(screen.getByText('Search'));
        await waitFor(() => screen.getByText('Test Video'));

        // Click title
        fireEvent.click(screen.getByText('Test Video'));

        // Expect fetch for video details
        await waitFor(() => expect(globalFetch).toHaveBeenCalledWith('/api/youtube/video/vid1'));

        // Should be in ID mode now (Video ID input visible)
        expect(screen.getByPlaceholderText(/Video ID/)).toBeDefined();
    });

    it('navigates to channel videos from channel detail', async () => {
         const mockChannel = {
             youtube_id: 'chan1',
             title: 'My Channel',
             description: 'Desc',
             custom_url: '@mychan',
             thumbnail_url: 'thumb',
             published_at: '2020-01-01',
             raw_json: '{}',
             video_count: 10,
             subscriber_count: 1000,
             view_count: 50000
         };

         // Mock responses
        globalFetch.mockImplementation((url) => {
            if (url.toString().includes('/api/youtube/channel/chan1')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => mockChannel
                });
            }
            if (url.toString().includes('/videos')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ videos: [mockVideo], limit: 10, offset: 0 })
                });
            }
             if (url.toString().includes('/channels')) {
                 return Promise.resolve({ ok: true, json: async () => mockChannels });
             }
            return Promise.reject(new Error('Unknown URL: ' + url));
        });

        render(<YoutubeViewer />);

        // Manually trigger channel fetch
        const idInput = screen.getByPlaceholderText('Video ID'); // Defaults to video mode
        const select = screen.getByDisplayValue('Video');
        fireEvent.change(select, { target: { value: 'channel' } });
        fireEvent.change(screen.getByPlaceholderText('Channel ID'), { target: { value: 'chan1' } });
        fireEvent.click(screen.getByText('Fetch'));

        await waitFor(() => screen.getByText('My Channel'));

        // Click "See Channel Videos"
        const seeVideosBtn = screen.getByText('See Channel Videos');
        fireEvent.click(seeVideosBtn);

        // Verify it switches to search and fetches videos with channel_id
        await waitFor(() => expect(globalFetch).toHaveBeenCalledWith(expect.stringContaining('/api/youtube/videos')));

        const calls = globalFetch.mock.calls.filter(c => c[0].toString().includes('/videos'));
        const lastCall = calls[calls.length - 1];
        const url = new URL(lastCall[0], 'http://localhost');
        expect(url.searchParams.get('channel_id')).toBe('chan1');
    });

    it('handles sorting', async () => {
        globalFetch
            .mockImplementation((url) => {
                if (url.toString().includes('/channels')) {
                     return Promise.resolve({
                        ok: true,
                        json: async () => mockChannels
                     });
                }
                if (url.toString().includes('/videos')) {
                     return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            videos: [mockVideo],
                            limit: 10,
                            offset: 0
                        })
                    });
                }
                return Promise.reject(new Error('Unknown URL: ' + url));
            });

        render(<YoutubeViewer />);
        fireEvent.click(screen.getByText('Search Database'));

        // Wait for channels fetch to avoid race
        await waitFor(() => expect(globalFetch).toHaveBeenCalledWith('/api/youtube/channels'));

        fireEvent.click(screen.getByText('Search')); // Initial search
        await waitFor(() => screen.getByText('Test Video'));

        // Click on Views header to sort
        fireEvent.click(screen.getByText(/Views/));

        await waitFor(() => {
            const calls = globalFetch.mock.calls.filter(c => c[0].toString().includes('/videos'));
            const lastCall = calls[calls.length - 1];
            const url = new URL(lastCall[0], 'http://localhost');
            expect(url.searchParams.get('sort_by')).toBe('view_count');
        });
    });

    it('handles pagination', async () => {
         globalFetch
            .mockImplementation((url) => {
                if (url.toString().includes('/channels')) {
                     return Promise.resolve({
                        ok: true,
                        json: async () => mockChannels
                     });
                }
                if (url.toString().includes('/videos')) {
                     return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            videos: Array(11).fill(null).map((_, i) => ({
                                ...mockVideo,
                                youtube_id: `vid${i}` // Unique IDs
                            })),
                            limit: 10,
                            offset: 0
                        })
                    });
                }
                return Promise.reject(new Error('Unknown URL: ' + url));
            });

        render(<YoutubeViewer />);
        fireEvent.click(screen.getByText('Search Database'));

        // Wait for channels fetch to avoid race
        await waitFor(() => expect(globalFetch).toHaveBeenCalledWith('/api/youtube/channels'));

        fireEvent.click(screen.getByText('Search'));
        await waitFor(() => screen.getAllByText('Test Video'));

        const nextBtn = screen.getByText('Next');
        fireEvent.click(nextBtn);

        await waitFor(() => {
            const calls = globalFetch.mock.calls.filter(c => c[0].toString().includes('/videos'));
            const lastCall = calls[calls.length - 1];
            const url = new URL(lastCall[0], 'http://localhost');
            expect(url.searchParams.get('offset')).toBe('10');
        });
    });

    it('initializes player with sessionId when provided', async () => {
        globalFetch.mockResolvedValue({
            ok: true,
            json: async () => mockVideo
        });

        const sessionId = "test-session-id";
        render(<YoutubeViewer sessionId={sessionId} />);

        // Enter ID and fetch
        const idInput = screen.getByPlaceholderText('Video ID');
        fireEvent.change(idInput, { target: { value: 'vid1' } });
        fireEvent.click(screen.getByText('Fetch'));

        await waitFor(() => screen.getByText('Test Video'));

        // Check if TubePlayer was initialized
        // Since TubePlayer is mocked globally in setup.ts, we need to access the mock.
        // vi.mocked helper can be used if we imported it, or just inspect the calls on the imported mock.

        await waitFor(() => {
            expect(TubePlayer).toHaveBeenCalled();
        });
        const mockInstance = (TubePlayer as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;

        // Wait for initialize to be called
        await waitFor(() => {
            expect(mockInstance.initialize).toHaveBeenCalledWith({
                cache: true,
                sessionId: sessionId
            });
        });
    });
});
