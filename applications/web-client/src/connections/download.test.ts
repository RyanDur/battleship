import {downloadUrl} from './download';

describe('downloadUrl', () => {
  it('returns dmg URL for macOS with coerced version', async () => {
    const result = await downloadUrl('macos', '0.11.0').value;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') expect(result.value).toBe('https://github.com/RyanDur/battleship/releases/download/v0.11.0/Battleship-1.11.0.dmg');
  });

  it('returns msi URL for Windows', async () => {
    const result = await downloadUrl('windows', '0.11.0').value;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') expect(result.value).toBe('https://github.com/RyanDur/battleship/releases/download/v0.11.0/Battleship-1.11.0.msi');
  });

  it('returns deb URL for Linux', async () => {
    const result = await downloadUrl('linux', '0.11.0').value;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') expect(result.value).toBe('https://github.com/RyanDur/battleship/releases/download/v0.11.0/battleship_1.11.0_amd64.deb');
  });

  it('returns failure for unknown platform', async () => {
    const result = await downloadUrl('unknown', '0.11.0').value;
    expect(result.kind).toBe('failure');
  });

  it('preserves major version when already >= 1', async () => {
    const result = await downloadUrl('macos', '2.3.0').value;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') expect(result.value).toBe('https://github.com/RyanDur/battleship/releases/download/v2.3.0/Battleship-2.3.0.dmg');
  });
});
