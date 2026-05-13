import type { DriverTier } from '../db/standingsTypes';

interface BadgeProps {
    tier: DriverTier;
}

export const DriverTierBadge = ({ tier }: BadgeProps) => {
    if (tier === 'Silver') {
        return (
            <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tracking-wider"
                style={{
                    background: 'linear-gradient(145deg, #8a8a8a 0%, #d4d4d4 30%, #eeeeee 55%, #bdbdbd 75%, #9a9a9a 100%)',
                    color: '#3a3a3a',
                    // boxShadow: '0 1px 3px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -1px 1px rgba(0,0,0,0.15)',
                    textShadow: '0 1px 0 rgba(255,255,255,0.6)',
                    border: '1px solid rgba(180,180,180,0.6)',
                }}
            >
                Silver
            </span>
        );
    }

    if (tier === 'Gold') {
        return (
            <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tracking-wider"
                style={{
                    background: 'linear-gradient(145deg, #7a5010 0%, #c9942a 30%, #f0c050 55%, #d4a030 75%, #a06820 100%)',
                    color: '#3d2000',
                    // boxShadow: '0 1px 4px rgba(200,140,30,0.5), inset 0 1px 2px rgba(255,220,100,0.5), inset 0 -1px 1px rgba(0,0,0,0.2)',
                    textShadow: '0 1px 0 rgba(255,220,120,0.7)',
                    border: '1px solid rgba(200,150,40,0.5)',
                }}
            >
                Gold
            </span>
        );
    }

    if (tier === 'Platinum') {
        return (
            <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold tracking-wider"
                style={{
                    background: 'linear-gradient(145deg, #2d7a6e 0%, #5bb5a0 30%, #a8e0d8 55%, #7cc8b8 75%, #3d9080 100%)',
                    color: '#0d3d38',
                    // boxShadow: '0 1px 4px rgba(80,200,180,0.4), inset 0 1px 2px rgba(200,240,235,0.5), inset 0 -1px 1px rgba(0,0,0,0.2)',
                    textShadow: '0 1px 0 rgba(200,240,235,0.7)',
                    border: '1px solid rgba(80,180,160,0.5)',
                }}
            >
                Platinum
            </span>
        );
    }

    if (tier === 'Bronze') {
        return (
            <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{
                    background: 'linear-gradient(145deg, #7a3a00 0%, #c06020 30%, #e08840 55%, #b06020 75%, #7a3a00 100%)',
                    color: '#fff0e0',
                    // boxShadow: '0 1px 3px rgba(160,80,20,0.4), inset 0 1px 1px rgba(255,200,120,0.3), inset 0 -1px 1px rgba(0,0,0,0.2)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                    border: '1px solid rgba(180,100,40,0.5)',
                }}
            >
                Bronze
            </span>
        );
    }

    return (
        <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{
                background: 'linear-gradient(145deg, #8a1010 0%, #c03020 30%, #e05030 55%, #b02010 75%, #7a0a0a 100%)',
                color: '#fff0f0',
                // boxShadow: '0 1px 3px rgba(180,30,20,0.4), inset 0 1px 1px rgba(255,150,140,0.3), inset 0 -1px 1px rgba(0,0,0,0.2)',
                textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                border: '1px solid rgba(200,60,40,0.5)',
            }}
        >
            Rookie
        </span>
    );
};

export default DriverTierBadge;