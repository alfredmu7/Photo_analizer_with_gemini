const { GoogleGenAI } = require("@google/genai"); 
const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

exports.handler = async (event, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "CORS OK" }) };
  }

  try {
    const data = JSON.parse(event.body);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: [{ inlineData: { mimeType: "image/jpeg", data: data.base64Image } }],
    });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text: response.text ? response.text.trim() : "ERROR" }),
    };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};