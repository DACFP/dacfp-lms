import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SecureResourceLink } from './SecureResourceLink';

const requestResource = vi.hoisted(() => vi.fn());

vi.mock('../context/LmsContext', () => ({
  useLms: () => ({ requestResource }),
}));

describe('SecureResourceLink', () => {
  it('uses a button so modified clicks cannot escape to a nonexistent resource route', () => {
    render(
      <SecureResourceLink
        className="button-secondary"
        resource={{
          id: 'resource-1',
          lesson_id: 'lesson-1',
          position: 1,
          title: 'Workbook',
          file_ref: 'seed/workbook.txt',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Workbook' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
