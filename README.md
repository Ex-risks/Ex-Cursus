# Ex-Cursus 

## Introduction

An interface to a series of agent-based cartographic experiments in animal movement, 2021–2023. Asad Khan.

Ex-Cursus, from its latinate _cursus_ "course" is an interface for a series of research experiments conducted between 2021 and 2023, each using agent-based simulation to investigate animal movement. The research is guided by a broader question: How does movement become memory, and how does memory shape the paths through which living beings inhabit the world?

This repository contains both the interface and the computational model that drives it. In each experiment, the map emerges directly from the movements of simulated animals. Every animal is an agent with its own internal state, behavioural capacities, and local rules. As the agents move, they inscribe lines; as those lines accumulate, they become the map. There is no prior basemap. The resulting drawing records where the animals travelled, how frequently they returned, and the order in which their routes developed.

The project was initially inspired by the National Geographic documentaries _A Deer Migration You Have to See to Believe_ (2014) and _Incredible Animal Journeys_ (2023), and _Sheep Teach Each Other How to Migrate Long Distances_ (2018). These works introduced migration as a form of socially learned and collectively maintained knowledge. This idea was further grounded in research by Brett Jesmer and colleagues (2018), which showed that large-mammal migration routes are not simply fixed at birth: they can be learned, socially transmitted, and gradually reconstructed by translocated populations over several generations.

Two additional sources shaped the project’s method. Tim Ingold’s account of the line as a trace of movement (2007) suggested that the route itself, drawn directly, could become the primary record. Craig Reynolds’s distributed model of flocking (1987) supplied the computational principle: coherent global patterns can emerge from local interactions, the defining operation of agent-based modelling.

The series became the basis for a successive experiments,_ Spacing Prediction_, which replaces fixed behavioural rules with multi-agent reinforcement learning and introduces anticipatory systems — in Robert Rosen's sense of a system that acts on an internal predictive model of future state (Rosen, 1985) — to ecological modelling and cartographic drawing.

Both belong to a longer programme: building small, legible simulated worlds — toy-worlds — as instruments for studying/training spatial intelligence. Each world fixes a few mechanisms, exposes them as parameters, and renders their spatial consequences directly, so that questions about memory, anticipation, and movement can be examined through construction.

## The Movement Model

A path is the joint output of an animal's internal state, navigation capacity, motion capacity, and the surrounding environment — the decomposition of Ran Nathan and colleagues (Nathan et al., 2008). Locomotion is a correlated random walk: at each step the agent turns toward a steering vector by a bounded amount, capped near 0.15 radians, so trajectories stay smooth and directionally persistent.

The steering vector sums several terms. Pack behaviour follows Craig Reynolds (Reynolds, 1987) in full — separation (weight 1.5), cohesion (0.8), and alignment, computed over packmates within a neighbourhood — so a pack travels as a coherent but deformable group, with collective structure emerging from local rules (Couzin et al., 2002).

The migration term is a seasonal bearing — south, north-east, north, south-west by season — blended with the direction of the agent's own remembered route. The route term projects the agent onto its nearest past same-season segment and aims six segments ahead; its weight rises with proximity to that route, to a maximum of 0.3 (Fagan et al., 2013).

Prey is a grid of biomass that regrows logistically toward a carrying capacity and is drawn down by kills. A hungry agent climbs the local biomass gradient; a successful kill removes a fixed amount of biomass and restores energy. Predation and regrowth together give the prey field its own slow dynamics, independent of any single animal.

Each pack deposits scent as it moves and steers away from the scent of other packs, which holds packs apart and lets territories form. This scent-mediated avoidance is the mechanism through which Paul Moorcroft and Mark Lewis derive wolf home ranges analytically (Moorcroft & Lewis, 2006), here run forward rather than solved.

Terrain enters as a cost-of-transport surface. The cost of a step rises with snow, high ground, and cold, and agents steer down the cost gradient. The surface can be analytic, or loaded from a greyscale image in which dark pixels read as low-cost ground, so a real landscape can be supplied as the substrate for movement.

A second feedback runs through the ground itself. Agents lay a trail that lowers the local cost of movement for those that follow, so used routes grow cheaper and reinforce themselves. This is stigmergy in Pierre-Paul Grassé's sense (Grassé, 1959), the mechanism also behind physical trail systems (Helbing, Keltsch, & Molnár, 1997).

Demography closes the model. Breeding pairs reproduce once a year at a den in spring, pups join the pack, and young animals disperse to found new packs. Energy lost to movement and gained from kills sets survival, so population and route structure develop together across generations of agents.

The environment is editable while the simulation runs. I can place dens, paint prey biomass, raise terrain cost, and introduce packs, then watch the corridors reorganise. In teaching this makes the decomposition adjustable in real time; in exhibition it lets a plate be composed deliberately, with the seed kept for exact reproduction.

## The Cartographic Record

The drawing separates ephemeral tracks from established routes. Line weight, value, and continuity encode how settled a route is: a single passage is thin and faint; a corridor reused across seasons is heavy, opaque, and continuous. This applies Jacques Bertin's visual variables (Bertin, 1983) to movement, read in the manner Alan MacEachren describes (MacEachren, 1995).

The drawing makes the route itself the document. Treating the line as the primary record places the work within Tim Ingold's account of the map as a trace of paths actually travelled (Ingold, 2007), with reuse and establishment shown directly in the weight of the line rather than annotated beside it.

Around the lines the plate carries conventional cartographic furniture: a kilometre graticule, a scale bar, a compass rose, and a title cartouche. A four-role typographic system orders the labelling — a tracked small-caps title, an uppercase section label, oldstyle tabular figures for numeric values, and italic annotation for natural features.

A second, quantitative layer reads the same tracks. Cursus estimates a kernel density surface of occupancy and extracts isopleth contours from it by marching squares (Lorensen & Cline, 1987), producing utilisation-distribution bands of the kind Brian Worton introduced for delimiting home range (Worton, 1989). The drawing and the measurement derive from one dataset.

## Running Cursus

Cursus runs in the browser without a build step. Open `index.html` with its `js/` modules alongside — `rng`, `config`, `environment`, `memory`, `metrics`, `experiments`, and `simulation`. The interface divides into a drawing surface and a parameter sidebar; the five most-used parameters carry sparklines that show their recent history.

```bash
git clone https://github.com/USERNAME/cursus.git
cd cursus
open index.html
```

Exports serve research and exhibition together. Vector SVG writes the full plate for printing at any size; PNG and JPEG give raster copies; a WebM recording and a timelapse capture the drawing as it forms; JSON and CSV carry the metrics. Each export is labelled with its seed, so any output traces back to its run.

## References

Bertin, J. (1983). *Semiology of Graphics: Diagrams, Networks, Maps* (W. J. Berg, Trans.). University of Wisconsin Press. (Original work published 1967.)

Buşoniu, L., Babuška, R., & De Schutter, B. (2008). A comprehensive survey of multiagent reinforcement learning. *IEEE Transactions on Systems, Man, and Cybernetics, Part C*, 38(2), 156–172.

Couzin, I. D., Krause, J., James, R., Ruxton, G. D., & Franks, N. R. (2002). Collective memory and spatial sorting in animal groups. *Journal of Theoretical Biology*, 218(1), 1–11.

Fagan, W. F., Lewis, M. A., Auger-Méthé, M., Avgar, T., Benhamou, S., … Mueller, T. (2013). Spatial memory and animal movement. *Ecology Letters*, 16(10), 1316–1329.

Grassé, P.-P. (1959). La reconstruction du nid et les coordinations interindividuelles chez *Bellicositermes natalensis* et *Cubitermes* sp. La théorie de la stigmergie. *Insectes Sociaux*, 6(1), 41–80.

Grimm, V., & Railsback, S. F. (2005). *Individual-based Modeling and Ecology*. Princeton University Press.

Helbing, D., Keltsch, J., & Molnár, P. (1997). Modelling the evolution of human trail systems. *Nature*, 388(6637), 47–50.

Ingold, T. (2007). *Lines: A Brief History*. Routledge.

Jesmer, B. R., Merkle, J. A., Goheen, J. R., Aikens, E. O., Beck, J. L., Courtemanch, A. B., … Kauffman, M. J. (2018). Is ungulate migration culturally transmitted? Evidence of social learning from translocated animals. *Science*, 361(6406), 1023–1025.

Lorensen, W. E., & Cline, H. E. (1987). Marching cubes: a high resolution 3D surface construction algorithm. *ACM SIGGRAPH Computer Graphics*, 21(4), 163–169.

MacEachren, A. M. (1995). *How Maps Work: Representation, Visualization, and Design*. Guilford Press.

Michener, W. K., & Jones, M. B. (2012). Ecoinformatics: supporting ecology as a data-intensive science. *Trends in Ecology & Evolution*, 27(2), 85–93.

Moorcroft, P. R., & Lewis, M. A. (2006). *Mechanistic Home Range Analysis*. Princeton University Press.

Nathan, R., Getz, W. M., Revilla, E., Holyoak, M., Kadmon, R., Saltz, D., & Smouse, P. E. (2008). A movement ecology paradigm for unifying organismal movement research. *Proceedings of the National Academy of Sciences*, 105(49), 19052–19059.

Reynolds, C. W. (1987). Flocks, herds and schools: a distributed behavioral model. *ACM SIGGRAPH Computer Graphics*, 21(4), 25–34.

Rosen, R. (1985). *Anticipatory Systems: Philosophical, Mathematical, and Methodological Foundations*. Pergamon Press.

Worton, B. J. (1989). Kernel methods for estimating the utilization distribution in home-range studies. *Ecology*, 70(1), 164–168.

## Licence

Cursus is released under the MIT Licence. © 2021–2023 Asad Khan.
