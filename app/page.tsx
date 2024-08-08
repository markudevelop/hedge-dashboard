"use client"
import React, { useState } from 'react';
import { ArrowRight, Shield, DollarSign, TrendingUp, Menu, X, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const NavLink = ({ href, children }) => (
  <a href={href} className="text-gray-200 hover:text-white transition-colors duration-200">
    {children}
  </a>
);

const FeatureCard = ({ icon: Icon, title, description, linkText, href }) => (
  <motion.a
    href={href}
    whileHover={{ scale: 1.03 }}
    className="block bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 border border-transparent hover:border-blue-400 dark:hover:border-blue-500"
  >
    <Icon className="text-blue-500 dark:text-blue-400 mb-4" size={32} />
    <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-white">{title}</h3>
    <p className="text-gray-600 dark:text-gray-300 mb-4">{description}</p>
    <span className="inline-flex items-center text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors duration-200">
      {linkText} <ArrowRight className="ml-2" size={16} />
    </span>
  </motion.a>
);

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className={`flex flex-col min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex-grow bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-white transition-colors duration-300">
        <header className="bg-white bg-opacity-10 dark:bg-gray-800 dark:bg-opacity-30 backdrop-filter backdrop-blur-lg fixed w-full z-10 transition-colors duration-300">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">Crypto Hedge</h1>
            <div className="flex items-center space-x-6">
              <nav className="hidden md:flex space-x-6">
                <NavLink href="/hedge">Hedging</NavLink>
                <NavLink href="/income">Income</NavLink>
                <NavLink href="/stocks">Stocks</NavLink>
                <NavLink href="/about">About</NavLink>
              </nav>
              <button
                onClick={toggleDarkMode}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors duration-200"
              >
                {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
              </button>
              <button
                className="md:hidden text-gray-600 dark:text-gray-300"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 bg-white dark:bg-gray-800 bg-opacity-95 dark:bg-opacity-95 z-20 flex flex-col items-center justify-center space-y-6"
            >
              <NavLink href="/hedge">Hedging</NavLink>
              <NavLink href="/income">Income</NavLink>
              <NavLink href="/stocks">Stocks</NavLink>
              <NavLink href="/about">About</NavLink>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="container mx-auto px-4 pt-24 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-800 dark:text-white">
              Crypto Hedge Fund <span className="text-blue-600 dark:text-blue-400">Dashboard</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Explore powerful techniques to manage risk and generate consistent income in the crypto market.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={Shield}
              title="Hedging Strategies"
              description="Protect your crypto portfolio with advanced hedging techniques."
              linkText="Learn Hedging"
              href="/hedge"
            />
            <FeatureCard
              icon={DollarSign}
              title="Income Generation"
              description="Discover methods to create steady income streams through crypto options."
              linkText="Explore Income"
              href="/income"
            />
            <FeatureCard
              icon={TrendingUp}
              title="Market Analysis"
              description="Analyze crypto market trends to identify the best trading opportunities."
              linkText="Analyze Markets"
              href="/stocks"
            />
          </div>
        </main>
      </div>

      <footer className="bg-gray-100 dark:bg-gray-800 py-6 transition-colors duration-300">
        <div className="container mx-auto px-4 text-center text-gray-600 dark:text-gray-400">
          &copy; 2024 Crypto Hedge. All rights reserved.
        </div>
      </footer>
    </div>
  );
}