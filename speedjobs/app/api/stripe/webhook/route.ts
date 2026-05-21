import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, PLANS, type PlanTier } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook error: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const employerId = session.metadata?.employer_id;
      const tier = session.metadata?.tier as PlanTier | undefined;
      if (employerId && tier) {
        const posts = tier === 'pro' ? 3 : tier === 'business' ? 9999 : 1;
        await admin
          .from('employers')
          .update({
            subscription_tier: tier,
            posts_remaining: posts,
            stripe_subscription_id: session.subscription as string,
            next_billing_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          })
          .eq('id', employerId);
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription as string;
      if (subId) {
        const { data: employer } = await admin
          .from('employers')
          .select('id, subscription_tier')
          .eq('stripe_subscription_id', subId)
          .single();
        if (employer) {
          const posts =
            employer.subscription_tier === 'pro'
              ? 3
              : employer.subscription_tier === 'business'
                ? 9999
                : 1;
          await admin
            .from('employers')
            .update({
              posts_remaining: posts,
              next_billing_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            })
            .eq('id', employer.id);
        }
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await admin
        .from('employers')
        .update({ posts_remaining: 0, stripe_subscription_id: null })
        .eq('stripe_subscription_id', sub.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
