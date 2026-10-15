"""Recompute average block colors for src/lib/blocks/blockData.ts.

Usage: python3 scripts/compute-block-colors.py <workdir>

<workdir> must contain blocks_latest.json (misode/mcmeta summary/blocks/data.json)
and blocks_<version>.json registries for each entry in VERS. Textures are fetched
from misode/mcmeta's assets branch into <workdir>/tex and are never committed;
only the resulting averages (plain numbers) end up in the repository.
"""
import json, os, sys, urllib.request, io
from PIL import Image
R = sys.argv[1]
TEX = os.path.join(R, 'tex'); os.makedirs(TEX, exist_ok=True)
COLORS = ['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black']
C = []  # (id, texture, props, tags)
for c in COLORS:
    C.append((f'{c}_wool', f'{c}_wool', None, ['wool','dyed']))
    C.append((f'{c}_concrete', f'{c}_concrete', None, ['concrete','dyed']))
    C.append((f'{c}_terracotta', f'{c}_terracotta', None, ['terracotta','dyed']))
C.append(('terracotta','terracotta',None,['terracotta']))
for w in ['oak','spruce','birch','jungle','acacia','dark_oak','mangrove','cherry','bamboo','crimson','warped','pale_oak']:
    C.append((f'{w}_planks', f'{w}_planks', None, ['wood','planks']))
for w in ['oak','spruce','birch','jungle','acacia','dark_oak','mangrove','cherry','pale_oak']:
    C.append((f'stripped_{w}_wood', f'stripped_{w}_log', {'axis':'y'}, ['wood']))
    C.append((f'{w}_wood', f'{w}_log', {'axis':'y'}, ['wood','bark']))
for w in ['crimson','warped']:
    C.append((f'stripped_{w}_hyphae', f'stripped_{w}_stem', {'axis':'y'}, ['wood','nether']))
    C.append((f'{w}_hyphae', f'{w}_stem', {'axis':'y'}, ['wood','nether','bark']))
for b in ['stone','smooth_stone','cobblestone','mossy_cobblestone','stone_bricks','mossy_stone_bricks','cracked_stone_bricks','andesite','polished_andesite','diorite','polished_diorite','granite','polished_granite','cobbled_deepslate','polished_deepslate','deepslate_bricks','deepslate_tiles','tuff','polished_tuff','tuff_bricks','calcite','dripstone_block','smooth_basalt']:
    C.append((b,b,None,['stone']))
C.append(('deepslate','deepslate',{'axis':'y'},['stone']))
for b,t in [('sandstone','sandstone'),('smooth_sandstone','sandstone_top'),('cut_sandstone','cut_sandstone'),('red_sandstone','red_sandstone'),('smooth_red_sandstone','red_sandstone_top'),('cut_red_sandstone','cut_red_sandstone')]:
    C.append((b,t,None,['sandstone']))
for b in ['bricks','mud_bricks','packed_mud','quartz_bricks','prismarine','prismarine_bricks','dark_prismarine','end_stone','end_stone_bricks','purpur_block','resin_bricks']:
    C.append((b,b,None,['masonry']))
C.append(('quartz_block','quartz_block_side',None,['masonry','quartz']))
C.append(('smooth_quartz','quartz_block_bottom',None,['masonry','quartz']))
for b in ['netherrack','nether_bricks','red_nether_bricks','nether_wart_block','warped_wart_block','blackstone','polished_blackstone','polished_blackstone_bricks','soul_soil','obsidian']:
    C.append((b,b,None,['nether']))
for b in ['iron_block','gold_block','diamond_block','emerald_block','lapis_block','coal_block','netherite_block','amethyst_block','raw_iron_block','raw_gold_block','raw_copper_block']:
    C.append((b,b,None,['mineral','precious']))
for b,t in [('waxed_copper_block','copper_block'),('waxed_exposed_copper','exposed_copper'),('waxed_weathered_copper','weathered_copper'),('waxed_oxidized_copper','oxidized_copper'),('waxed_cut_copper','cut_copper'),('waxed_exposed_cut_copper','exposed_cut_copper'),('waxed_weathered_cut_copper','weathered_cut_copper'),('waxed_oxidized_cut_copper','oxidized_cut_copper')]:
    C.append((b,t,None,['copper','mineral']))
for b,t in [('clay','clay'),('snow_block','snow'),('packed_ice','packed_ice'),('blue_ice','blue_ice'),('moss_block','moss_block'),('pale_moss_block','pale_moss_block'),('mud','mud'),('dirt','dirt'),('coarse_dirt','coarse_dirt'),('honeycomb_block','honeycomb_block'),('sponge','sponge'),('resin_block','resin_block'),('dried_kelp_block','dried_kelp_side')]:
    C.append((b,t,None,['natural']))
C.append(('bone_block','bone_block_side',{'axis':'y'},['natural']))
C.append(('red_mushroom_block','red_mushroom_block',None,['natural']))
C.append(('brown_mushroom_block','brown_mushroom_block',None,['natural']))
C.append(('mushroom_stem','mushroom_stem',None,['natural']))

VERS = ['1.16.5','1.18.2','1.19','1.20.1','1.21','1.21.4','26.1']
sets = {v:set(json.load(open(os.path.join(R,f"blocks_{v}.json")))) for v in VERS}
latest = json.load(open(os.path.join(R,'blocks_latest.json')))
out = []
for bid, tex, props, tags in C:
    if bid not in latest:
        print('MISSING BLOCK', bid); continue
    defprops = latest[bid][1] if len(latest[bid])>1 else {}
    if props is None:
        props = {}
        if defprops: props = dict(defprops)
    since = next((v for v in VERS if bid in sets[v]), None)
    p = os.path.join(TEX, tex+'.png')
    if not os.path.exists(p):
        url = f'https://raw.githubusercontent.com/misode/mcmeta/assets/assets/minecraft/textures/block/{tex}.png'
        try:
            data = urllib.request.urlopen(url).read()
            open(p,'wb').write(data)
        except Exception as e:
            print('MISSING TEX', tex, e); continue
    im = Image.open(p).convert('RGBA')
    px = [q for q in im.get_flattened_data() if q[3] > 0]
    n = len(px)
    r = sum(q[0] for q in px)/n; g = sum(q[1] for q in px)/n; b = sum(q[2] for q in px)/n
    var = sum((q[0]-r)**2+(q[1]-g)**2+(q[2]-b)**2 for q in px)/n
    out.append({'id':bid,'rgb':[round(r),round(g),round(b)],'noise':round((var/3)**0.5,1),'since':since,'props':props,'tags':tags})
json.dump(out, open(os.path.join(R,'blocks_out.json'),'w'), indent=0)
print(len(out))
for o in out: print(o['id'], o['rgb'], o['noise'], o['since'], o['props'] or '')
