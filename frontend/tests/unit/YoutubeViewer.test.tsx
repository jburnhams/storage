import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { YoutubeViewer } from '../../src/components/YoutubeViewer';
import React from 'react';

// Mock fetch
global.fetch = vi.fn();

describe('YoutubeViewer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly', () => {
    render(<YoutubeViewer />);
    expect(screen.getByText('YouTube Viewer')).toBeDefined();
    expect(screen.getByPlaceholderText('Video ID (e.g. dQw...)')).toBeDefined();
    expect(screen.getByText('Fetch')).toBeDefined();
  });

  it('toggles between Video and Channel input', () => {
    render(<YoutubeViewer />);
    const select = screen.getByRole('combobox');

    fireEvent.change(select, { target: { value: 'channel' } });
    expect(screen.getByPlaceholderText('Channel ID (e.g. UC...)')).toBeDefined();

    fireEvent.change(select, { target: { value: 'video' } });
    expect(screen.getByPlaceholderText('Video ID (e.g. dQw...)')).toBeDefined();
  });

  it('fetches and displays video data', async () => {
    const mockData = {
      youtube_id: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      description: 'Rick Astley',
      published_at: '2009-10-25T00:00:00Z',
      thumbnail_url: 'http://example.com/thumb.jpg',
      statistics: JSON.stringify({ viewCount: "1000", likeCount: "10" }),
      raw_json: JSON.stringify({ id: 'dQw4w9WgXcQ', snippet: { title: 'Never Gonna Give You Up' } }),
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    render(<YoutubeViewer />);

    const input = screen.getByPlaceholderText('Video ID (e.g. dQw...)');
    fireEvent.change(input, { target: { value: 'dQw4w9WgXcQ' } });

    const button = screen.getByText('Fetch');

    // Wrap async actions in act
    await act(async () => {
        fireEvent.click(button);
    });

    await waitFor(() => {
        expect(screen.getByText('Never Gonna Give You Up')).toBeDefined();
    });

    expect(screen.getByText('Rick Astley')).toBeDefined();
    expect(screen.getByText('view Count')).toBeDefined();
    expect(screen.getByText('1000')).toBeDefined();
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'NOT_FOUND', message: 'Video not found' }),
    });

    render(<YoutubeViewer />);

    const input = screen.getByPlaceholderText('Video ID (e.g. dQw...)');
    fireEvent.change(input, { target: { value: 'invalid' } });

    const button = screen.getByText('Fetch');

    await act(async () => {
        fireEvent.click(button);
    });

    await waitFor(() => {
        expect(screen.getByText('Video not found')).toBeDefined();
    });
  });
});
