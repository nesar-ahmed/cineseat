import type { ReactNode } from 'react';
import { SettingsShell } from '../../../../features/account/settings/settings-shell';

// One frame for every settings page: breadcrumb, title and section navigation.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-x py-8 sm:py-12">
      <SettingsShell>{children}</SettingsShell>
    </div>
  );
}
