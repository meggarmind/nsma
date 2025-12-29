import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Input from '@/components/ui/Input';

describe('Input', () => {
  it('renders without label', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label="Username" />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('shows required indicator when required', () => {
    render(<Input label="Email" required />);
    const label = screen.getByText('Email');
    expect(label.parentElement).toHaveTextContent('*');
  });

  it('sets aria-required when required', () => {
    render(<Input label="Email" required />);
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-required', 'true');
  });

  it('displays help text with proper accessibility', () => {
    render(<Input label="Password" helpText="Must be 8+ characters" />);
    const input = screen.getByLabelText('Password');
    const helpText = screen.getByText('Must be 8+ characters');

    expect(helpText).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining('help'));
  });

  it('displays error message with proper accessibility', () => {
    render(<Input label="Email" error="Invalid email format" />);
    const input = screen.getByLabelText('Email');
    const errorText = screen.getByRole('alert');

    expect(errorText).toHaveTextContent('Invalid email format');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining('error'));
  });

  it('calls onChange when typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Input label="Name" onChange={onChange} />);
    await user.type(screen.getByLabelText('Name'), 'John');

    expect(onChange).toHaveBeenCalled();
  });

  it('accepts different input types', () => {
    render(<Input label="Password" type="password" />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('applies custom className', () => {
    render(<Input label="Test" className="custom-input" />);
    expect(screen.getByLabelText('Test')).toHaveClass('custom-input');
  });

  it('associates label with input using generated id', () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText('Email');
    const label = screen.getByText('Email');

    expect(label).toHaveAttribute('for', input.id);
  });
});
