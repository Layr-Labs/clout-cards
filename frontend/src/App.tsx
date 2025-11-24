import './App.css'
import { SiX } from 'react-icons/si'
import { FaWallet, FaGamepad } from 'react-icons/fa'
import { motion } from 'framer-motion'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Admin from './Admin'

/**
 * Landing page component for CloutCards
 *
 * Displays a hero section with the CloutCards hero image and three feature
 * sections describing the key aspects of the platform.
 */
function LandingPage() {
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <nav className="header-nav">
          <a href="/" className="nav-link">Home</a>
          <a href="#leaderboard" className="nav-link">Leaderboard</a>
          <a href="#docs" className="nav-link">Docs</a>
          <button className="header-play-button">Play Now</button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <video 
          src="/hero.m4a" 
          className="hero-image"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="hero-content">
          <motion.img 
            src="/clout-cards-title.png" 
            alt="CloutCards" 
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "linear" }}
          />
          <div className="hero-buttons">
            <motion.button 
              className="cta-button cta-primary"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "linear" }}
            >
              Play Now
            </motion.button>
            <motion.button 
              className="cta-button cta-secondary"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "linear" }}
            >
              Learn More
            </motion.button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <motion.h2 
          className="features-title"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          Real People. Real Assets. Real UX.
        </motion.h2>
        <div className="features-grid">
          <motion.div 
            className="feature-card"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="feature-icon">
              <SiX size={48} />
            </div>
            <h3 className="feature-title">Socially Aware</h3>
            <p className="feature-description">
              X integration lets you know who you are playing against, and how real they truly are.
            </p>
          </motion.div>

          <motion.div 
            className="feature-card"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="feature-icon">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="48" 
                height="48" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <h3 className="feature-title">Crypto Betting</h3>
            <p className="feature-description">
              Use ETH to deposit, wager, and win assets playing a game of skill against your friends.
            </p>
          </motion.div>

          <motion.div 
            className="feature-card"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="feature-icon">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="48" 
                height="48" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 className="feature-title">Trustless and Gasless</h3>
            <p className="feature-description">
              Gameplay execution powered by Trustless Execution Environments on EigenCloud.
            </p>
          </motion.div>
        </div>
      </section>

      {/* How to Play Section */}
      <section className="how-to-play">
        <motion.h2 
          className="how-to-play-title"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          Playing Simple as 1, 2, 3
        </motion.h2>
        <div className="steps-grid">
          <motion.div 
            className="step-card"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="step-number">1</div>
            <div className="step-icon">
              <SiX size={48} />
            </div>
            <div className="step-content">
              <h3 className="step-title">Connect X Account</h3>
              <p className="step-description">
                Link your X (Twitter) account to verify your identity and see who you're playing against. Your social presence adds credibility to your gameplay.
              </p>
            </div>
          </motion.div>

          <motion.div 
            className="step-card"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="step-number">2</div>
            <div className="step-icon">
              <FaWallet size={48} />
      </div>
            <div className="step-content">
              <h3 className="step-title">Deposit Funds</h3>
              <p className="step-description">
                Add ETH to your escrow account. Your funds are held securely on-chain and can be withdrawn anytime with TEE authorization.
        </p>
      </div>
          </motion.div>

          <motion.div 
            className="step-card"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="step-number">3</div>
            <div className="step-icon">
              <FaGamepad size={48} />
            </div>
            <div className="step-content">
              <h3 className="step-title">Play Away</h3>
              <p className="step-description">
                Join tables, play against friends, and compete for real assets. Gameplay is powered by Trustless Execution Environments for seamless, gasless experiences.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

/**
 * Main App component with routing
 *
 * Sets up React Router and defines routes for the application.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
