import type { ReactNode } from 'react';

export interface HeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

declare const Header: React.FC<HeaderProps>;
export default Header;
