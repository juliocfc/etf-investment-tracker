import React from "react";
import { Shield, Lock, Eye, FileText, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Privacy: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {onBack && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack}
          className="text-slate-500 hover:text-primary gap-2 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
      )}

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-border space-y-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Privacy Policy</h1>
            <p className="text-slate-500 font-medium">Last updated: March 18, 2026</p>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Eye className="w-5 h-5 text-primary" />
            <h2>Information We Collect</h2>
          </div>
          <div className="prose prose-slate max-w-none text-slate-600 space-y-3">
            <p>
              To provide our portfolio tracking services, we collect and process the following information:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Personal Identity Information (PII):</strong> Your name and email address provided through Google OAuth during the authentication process.</li>
              <li><strong>Investment Data:</strong> Portfolio names, holdings, symbols, transaction history (buy/sell), and cash balance records that you manually enter.</li>
              <li><strong>System Logs:</strong> Basic technical data such as browser type and session timestamps to ensure system security and stability.</li>
            </ul>
          </div>
        </section>

        <section className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Lock className="w-5 h-5 text-primary" />
            <h2>How We Protect Your Data</h2>
          </div>
          <div className="prose prose-slate max-w-none text-slate-600 space-y-3">
            <p>
              Your security is our priority. We implement several layers of protection:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Secure Authentication:</strong> We use industry-standard Google OAuth 2.0. We never see or store your Google password.</li>
              <li><strong>Encrypted Transport:</strong> All data transmitted between your browser and our servers is encrypted using TLS (HTTPS).</li>
              <li><strong>Data Isolation:</strong> Your investment data is strictly isolated to your account and is never shared with other users.</li>
            </ul>
          </div>
        </section>

        <section className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <FileText className="w-5 h-5 text-primary" />
            <h2>How We Use Your Information</h2>
          </div>
          <div className="prose prose-slate max-w-none text-slate-600 space-y-3">
            <p>
              We only use your information for the following purposes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide and maintain the portfolio tracking service.</li>
              <li>To calculate and display your portfolio performance metrics.</li>
              <li>To communicate with you regarding your support requests via our contact form.</li>
              <li><strong>We do not sell your personal or financial data to third parties.</strong></li>
            </ul>
          </div>
        </section>

        <section className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Shield className="w-5 h-5 text-primary" />
            <h2>Your Rights</h2>
          </div>
          <div className="prose prose-slate max-w-none text-slate-600 space-y-3">
            <p>
              You maintain full control over your data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> You can view all your data through the application interface.</li>
              <li><strong>Deletion:</strong> You can delete individual portfolios or your entire account history at any time through the "All Portfolios" management page.</li>
              <li><strong>Inquiry:</strong> If you have questions about your data, you can contact us through the integrated Contact form.</li>
            </ul>
          </div>
        </section>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mt-8 text-sm text-slate-500 italic">
          Disclaimer: Investment Insights is a tracking tool only. We do not provide financial advice. Your financial data is stored securely but you should always maintain your own records.
        </div>
      </div>
    </div>
  );
};

export default Privacy;
