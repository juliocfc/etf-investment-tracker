import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Send, User, MessageSquare, Info } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

const Contact: React.FC = () => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast.error("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const web3FormData = new FormData();
      web3FormData.append("access_key", import.meta.env.WEB3FORMS_ACCESS_KEY || "");
      web3FormData.append("name", formData.name);
      web3FormData.append("email", formData.email);
      web3FormData.append("subject", `[Investment Tracker] ${formData.subject}`);
      web3FormData.append("message", formData.message);
      web3FormData.append("from_name", "Investment Insights Contact Form");

      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: web3FormData
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Message sent successfully! We'll get back to you soon.");
        setFormData({
          name: user?.name || "",
          email: user?.email || "",
          subject: "",
          message: "",
        });
      } else {
        throw new Error(data.message || "Failed to send message");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-800">Contact Support</h2>
        <p className="text-slate-500">Have questions or feedback? We'd love to hear from you.</p>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Send a Message</CardTitle>
              <CardDescription>Fill out the form below and our team will respond as soon as possible.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Full Name
                </label>
                <Input
                  placeholder="Your Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white border-slate-200 focus:border-primary focus:ring-primary/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" />
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-white border-slate-200 focus:border-primary focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Subject
              </label>
              <Input
                placeholder="What is this regarding?"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="bg-white border-slate-200 focus:border-primary focus:ring-primary/20"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" />
                Your Message
              </label>
              <Textarea
                placeholder="How can we help you today?"
                rows={6}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="bg-white border-slate-200 focus:border-primary focus:ring-primary/20 resize-none"
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full py-6 text-base font-bold bg-[#004a99] hover:bg-[#003d7a] shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98]"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sending Message...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  <span>Send Message</span>
                </div>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-100 text-center space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Support Hours</div>
          <div className="text-xs font-semibold text-slate-700">Mon-Fri, 9am-5pm EST</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-100 text-center space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Response Time</div>
          <div className="text-xs font-semibold text-slate-700">Typically &lt; 24 Hours</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-100 text-center space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</div>
          <div className="text-xs font-semibold text-green-600 flex items-center justify-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
            Online
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
