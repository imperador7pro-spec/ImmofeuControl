import { NextRequest, NextResponse } from 'next/server';
import { stripe, PLANS, createStripeCustomer, type PlanTier } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tier } = (await request.json()) as { tier: PlanTier };
  const plan = PLANS[tier];
  if (!plan || !plan.priceId) {
    return NextResponse.json({ error: 'Invalid plan or missing price id' }, { status: 400 });
  }

  const { data: employer } = await supabase
    .from('employers')
    .select('id, company_name, stripe_customer_id')
    .eq('user_id', user.id)
    .single();
  if (!employer) return NextResponse.json({ error: 'Employer not found' }, { status: 404 });

  let customerId = employer.stripe_customer_id;
  if (!customerId) {
    const customer = await createStripeCustomer(
      user.email || `${user.id}@speedjobs.local`,
      employer.company_name,
    );
    customerId = customer.id;
    await supabase
      .from('employers')
      .update({ stripe_customer_id: customerId })
      .eq('id', employer.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/employer/dashboard?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/employer/signup?canceled=true`,
    metadata: { employer_id: employer.id, tier },
  });

  return NextResponse.json({ url: session.url });
}
