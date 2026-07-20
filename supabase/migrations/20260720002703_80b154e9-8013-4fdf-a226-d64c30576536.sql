
UPDATE public.ai_providers SET enabled = true, priority = 5, default_model = 'google/gemini-2.5-flash', last_status = NULL WHERE provider = 'lovable';
UPDATE public.ai_providers SET enabled = false WHERE provider IN ('gemini','openrouter','mistral','cerebras','sambanova','huggingface','nvidia','cloudflare','cohere');
