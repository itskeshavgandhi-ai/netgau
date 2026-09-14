// @vitest-environment jsdom
/**
 * Mounts the renderer views inside a DOM (no Electron). This is the closest the
 * CI sandbox can get to "running the app": it catches runtime errors in the React
 * tree — bad hooks, undefined components, crashes while rendering live samples.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App from '../src/renderer/App';
import Studio from '../src/renderer/views/Studio';
import Widget from '../src/renderer/views/Widget';
import { StoreProvider } from '../src/renderer/lib/store';

afterEach(cleanup);

describe('renderer mounts without Electron', () => {
  it('renders the Studio with its navigation', async () => {
    render(
      <StoreProvider>
        <Studio />
      </StoreProvider>,
    );
    expect(screen.getByText('NetGauge')).toBeTruthy();
    expect(screen.getByText('Speed test')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Browser preview')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/Live/).length).toBeGreaterThan(0));
  });

  it('renders the Widget with live numbers', async () => {
    render(
      <StoreProvider>
        <Widget />
      </StoreProvider>,
    );
    // The simulated bridge seeds samples, so a Mbps readout should appear.
    await waitFor(
      () => {
        const text = document.body.textContent ?? '';
        expect(text).toContain('Mbps');
      },
      { timeout: 3000 },
    );
  });

  it('mounts the whole App router', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('NetGauge')).toBeTruthy());
  });
});
