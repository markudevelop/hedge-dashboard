const NavLink = ({ href, children }) => (
    <a href={href} className="text-gray-600 dark:text-gray-300 hover:text-white transition-colors duration-200">
        {children}
    </a>
);

export default NavLink;
