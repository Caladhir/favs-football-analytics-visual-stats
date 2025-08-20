// src/ui/Button.jsx - AŽURIRANA GLAVNA BUTTON KOMPONENTA
import React, { forwardRef } from "react";
import { Icon } from "@iconify-icon/react";

const Button = forwardRef(
  (
    {
      children,
      className = "",
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles = `
    relative inline-flex items-center justify-center
    font-semibold transition-all duration-300 ease-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:cursor-not-allowed transform
    border overflow-hidden group
  `;

    // Size variants
    const sizeStyles = {
      xs: "px-2.5 py-1.5 text-xs rounded-md gap-1",
      sm: "px-3 py-2 text-sm rounded-lg gap-1.5",
      md: "px-4 py-2.5 text-sm rounded-lg gap-2",
      lg: "px-6 py-3 text-base rounded-xl gap-2.5",
      xl: "px-8 py-4 text-lg rounded-xl gap-3",
    };

    // Variant styles - AŽURIRANO S CRVENOM TEMOM
    const variantStyles = {
      primary: `
      bg-gradient-to-r from-red-600 to-red-700 
      text-white border-red-500
      hover:from-red-700 hover:to-red-800 hover:scale-[1.02]
      focus:ring-red-500/50 
      disabled:from-gray-400 disabled:to-gray-500 disabled:hover:scale-100
      shadow-lg hover:shadow-xl hover:shadow-red-500/25
    `,
      secondary: `
      bg-gradient-to-r from-gray-600 to-gray-700 
      text-white border-gray-500
      hover:from-gray-700 hover:to-gray-800 hover:scale-[1.02]
      focus:ring-gray-500/50
      disabled:from-gray-400 disabled:to-gray-500 disabled:hover:scale-100
      shadow-lg hover:shadow-xl hover:shadow-gray-500/25
    `,
      outline: `
      bg-transparent border-2 border-red-500 text-red-500
      hover:bg-red-500 hover:text-white hover:scale-[1.02]
      focus:ring-red-500/50
      disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent disabled:hover:scale-100
    `,
      ghost: `
      bg-white/10 backdrop-blur-sm border-white/20 text-white
      hover:bg-white/20 hover:scale-[1.02]
      focus:ring-white/50
      disabled:bg-gray-500/20 disabled:text-gray-400 disabled:hover:scale-100
    `,
      success: `
      bg-gradient-to-r from-green-600 to-green-700 
      text-white border-green-500
      hover:from-green-700 hover:to-green-800 hover:scale-[1.02]
      focus:ring-green-500/50
      shadow-lg hover:shadow-xl hover:shadow-green-500/25
    `,
      danger: `
      bg-gradient-to-r from-red-600 to-red-700 
      text-white border-red-500
      hover:from-red-700 hover:to-red-800 hover:scale-[1.02]
      focus:ring-red-500/50
      shadow-lg hover:shadow-xl hover:shadow-red-500/25
    `,
      warning: `
      bg-gradient-to-r from-yellow-500 to-orange-500 
      text-white border-yellow-400
      hover:from-yellow-600 hover:to-orange-600 hover:scale-[1.02]
      focus:ring-yellow-500/50
      shadow-lg hover:shadow-xl hover:shadow-yellow-500/25
    `,
    };

    const combinedClassName = `
    ${baseStyles}
    ${sizeStyles[size]}
    ${variantStyles[variant]}
    ${fullWidth ? "w-full" : ""}
    ${disabled || isLoading ? "opacity-50" : ""}
    ${className}
  `;

    return (
      <button
        ref={ref}
        className={combinedClassName}
        disabled={disabled || isLoading}
        {...props}
      >
        {/* Animated background effect */}
        <span className="absolute inset-0 bg-white/10 rounded-full scale-0 transition-transform duration-500 group-hover:scale-100" />

        {/* Content wrapper */}
        <span className="relative flex items-center justify-center gap-inherit">
          {/* Left icon */}
          {leftIcon && !isLoading && (
            <Icon icon={leftIcon} className="w-4 h-4" />
          )}

          {/* Loading spinner */}
          {isLoading && (
            <Icon icon="mdi:loading" className="w-4 h-4 animate-spin" />
          )}

          {/* Button text */}
          {children && (
            <span className={isLoading ? "opacity-70" : ""}>{children}</span>
          )}

          {/* Right icon */}
          {rightIcon && !isLoading && (
            <Icon icon={rightIcon} className="w-4 h-4" />
          )}
        </span>

        {/* Glow effect */}
        <span
          className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md bg-current pointer-events-none"
          style={{ filter: "blur(8px)", opacity: 0.1 }}
        />
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
export default Button;
