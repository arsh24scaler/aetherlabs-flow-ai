import { NextResponse } from "next/server";
import { connectToDatabase, Lead } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const web3Key = process.env.WEB3FORMS_ACCESS_KEY;

        // --- STEP 1: Store in MongoDB (Reliable Local Backup) ---
        try {
            await connectToDatabase();
            await Lead.findOneAndUpdate(
                { email },
                {
                    email,
                    ip: req.headers.get("x-forwarded-for") || "unknown",
                    capturedAt: new Date()
                },
                { upsert: true, new: true }
            );
            console.log(`[STORAGE] Email saved to MongoDB: ${email}`);
        } catch (dbError) {
            console.error("[STORAGE] MongoDB Error:", dbError);
        }

        // --- STEP 2: Use Web3Forms for Email Delivery/Storage ---
        let web3Stored = false;
        if (web3Key) {
            try {
                const res = await fetch("https://api.web3forms.com/submit", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        access_key: web3Key,
                        email: email,
                        from_name: "AetherLabs AI",
                        subject: "New AI Lead Captured",
                        message: `A new user with email ${email} has requested access to the AI analysis.`
                    })
                });

                const data = await res.json();
                web3Stored = data.success;

                if (web3Stored) {
                    console.log(`[WEB3FORMS] Lead delivered for: ${email}`);
                } else {
                    console.error("[WEB3FORMS] Error:", data);
                }
            } catch (err) {
                console.error("[WEB3FORMS] Network Error:", err);
            }
        } else {
            console.warn("[WEB3FORMS] WEB3FORMS_ACCESS_KEY is missing in env.");
        }

        return NextResponse.json({
            success: true,
            stored: {
                mongodb: true,
                web3forms: web3Stored
            }
        });
    } catch (error) {
        console.error("Error in save-email API:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
