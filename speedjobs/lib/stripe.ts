import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
});

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 1900,
    posts: 1,
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID || '',
  },
  pro: {
    name: 'Pro',
    price: 4900,
    posts: 3,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
  },
  business: {
    name: 'Business',
    price: 9900,
    posts: null,
    priceId: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID || '',
  },
} as const;

export type PlanTier = keyof typeof PLANS;

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  metadata?: Record<string, string>,
) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/employer/dashboard?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/employer/signup?canceled=true`,
    metadata,
  });
}

export async function createStripeCustomer(email: string, name: string) {
  return stripe.customers.create({ email, name });
}
