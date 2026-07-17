import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Box, BarChart3, Globe, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center px-6 border-b bg-white">
        <div className="flex items-center gap-2">
          <Box className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold tracking-tight text-foreground">DimensionX</span>
        </div>
        <nav className="ml-auto flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign In
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get Started</Button>
          </Link>
        </nav>
      </header>
      
      <main className="flex-1 flex flex-col items-center justify-center py-20 px-6 text-center overflow-hidden relative">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-100 via-gray-50 to-white"></div>
        
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-800 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-blue-600 mr-2"></span>
            3D AR Conversion Engine is Live
          </div>
          
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.1]">
            The command center for <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">global e-commerce.</span>
          </h1>
          
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Manage your product catalog, trigger 3D AR model conversions, sync seamlessly from Shopify and Salla, and serve buyers in 5 languages from one precision dashboard.
          </p>
          
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto text-base h-12 px-8">
                Start building your catalog <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 px-8 bg-white">
                Sign in to workspace
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-32 grid grid-cols-1 gap-8 sm:grid-cols-3 w-full max-w-5xl">
          <div className="flex flex-col items-center text-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <Box className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Automated 3D AR</h3>
            <p className="text-gray-500 text-sm">Upload standard product images and automatically generate high-fidelity GLB and USDZ models.</p>
          </div>
          <div className="flex flex-col items-center text-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
              <Globe className="h-6 w-6 text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Global Localization</h3>
            <p className="text-gray-500 text-sm">Built-in support for 5 major languages including right-to-left layout for Arabic content.</p>
          </div>
          <div className="flex flex-col items-center text-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Native Integrations</h3>
            <p className="text-gray-500 text-sm">Sync your catalog instantly from Shopify and Salla with smart data mapping and conflict resolution.</p>
          </div>
        </div>
      </main>
      
      <footer className="py-8 text-center text-sm text-gray-500 border-t">
        <p>© {new Date().getFullYear()} DimensionX. All rights reserved.</p>
      </footer>
    </div>
  );
}