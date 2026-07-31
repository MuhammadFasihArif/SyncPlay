"use client";

import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  const [showAndroidModal, setShowAndroidModal] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (typeof window !== "undefined") {
      const isStandaloneMode = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);

      // Detect iOS
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
      setIsIOS(isIOSDevice);

      // Listen for Android/Desktop install prompt
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } else {
      // Fallback for non-secure origins or if Chrome suppresses the event
      setShowAndroidModal(true);
    }
  };

  // If app is already installed, hide the button completely
  if (isStandalone) {
    return null;
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="flex items-center space-x-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.15)] active:scale-95"
      >
        <Download className="w-4 h-4" />
        <span className="text-sm font-semibold">Install App</span>
      </button>

      <AnimatePresence>
        {showIOSModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowIOSModal(false)}
          >
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowIOSModal(false)}
                className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-inner">
                <Download className="w-8 h-8" />
              </div>
              
              <h2 className="text-2xl font-bold text-center mb-2">Install SyncPlay</h2>
              <p className="text-neutral-400 text-center mb-8 text-sm">
                Install this app on your iPhone for a full-screen, native experience.
              </p>

              <div className="space-y-4">
                <div className="flex items-center space-x-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800/50">
                  <div className="bg-neutral-800 p-2 rounded-lg text-neutral-300">
                    <Share className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">1. Tap the Share button</div>
                    <div className="text-xs text-neutral-500">Located at the bottom of Safari</div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800/50">
                  <div className="bg-neutral-800 p-2 rounded-lg text-neutral-300">
                    <PlusSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">2. Tap Add to Home Screen</div>
                    <div className="text-xs text-neutral-500">Scroll down slightly to find it</div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowIOSModal(false)}
                className="w-full mt-8 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-4 rounded-xl transition-colors active:scale-95"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}

        {showAndroidModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowAndroidModal(false)}
          >
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowAndroidModal(false)}
                className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-inner">
                <Download className="w-8 h-8" />
              </div>
              
              <h2 className="text-2xl font-bold text-center mb-2">Install SyncPlay</h2>
              <p className="text-neutral-400 text-center mb-8 text-sm">
                Because of browser security settings, we couldn't trigger the automatic download.
              </p>

              <div className="space-y-4">
                <div className="flex items-center space-x-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800/50">
                  <div className="bg-neutral-800 p-2 rounded-lg text-neutral-300">
                    <span className="font-bold text-xl">⋮</span>
                  </div>
                  <div>
                    <div className="font-semibold text-sm">1. Tap the Browser Menu</div>
                    <div className="text-xs text-neutral-500">Top right corner of Chrome</div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800/50">
                  <div className="bg-neutral-800 p-2 rounded-lg text-neutral-300">
                    <PlusSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">2. Tap Install App</div>
                    <div className="text-xs text-neutral-500">Or "Add to Home Screen"</div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowAndroidModal(false)}
                className="w-full mt-8 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-4 rounded-xl transition-colors active:scale-95"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
