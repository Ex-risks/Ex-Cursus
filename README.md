# Ex-Cursus 

Ex-Cursus from the latinate _cursus_: a course, a running, the track a thing takes – is an interface to a series of agent-based simulations I developed between 2022-2023, to investigate more-than-human ecologies of movement using cartographic drawing.

The work began with understanding climate-induced migration. In several large-mammal species, routes are not wholly innate. Route knowledge can be learned socially, carried often across generations, and rebuilt when a population enters unfamiliar terrain. A path, in this sense, can be inherited. I wanted to know when repeated movement becomes memory—and when memory becomes infrastructure.

This led me to the wolf pack: a social body whose movement exceeds any one animal. Its paths emerge from six interacting conditions: pack cohesion, prey distribution, territorial marking, rival scent, spatial memory, and seasonal movement understood with David Mech and Luigi Boitani accounts of wolf ecology (Mech and Boitani 2003). Its broader premise draws on Aldo Leopold’s account of the wolf as inseparable from the ecological system it inhabits (Leopold, 1949).

The simulation that I have built, is not a validated ecological model of wolf behaviour but is a speculative approximation of existing studies. Each agent in the simulation follows five local rules: hold course, remain with the existing pack or disperse, pursue prey, avoid rival scent, and follow the season’s bearing. At every step, its displacement becomes a short line. No agent sees the whole route. No rule contains the final map. Across successive seasons, repeated passages gather and thicken into cartographic corridors.


## The Movement Model

A wolf moves as a correlated random walk, which is to say it mostly keeps going the way it was already going. On top of that it steers by several pulls at once — toward its packmates and away from the nearest of them, along the bearing of the current season, up the local gradient of prey, downhill across the cost of the ground — and the sum becomes a bounded turn, capped so the animal cannot spin in place. 

Then a small random kick is added, drawn from a wrapped Cauchy Distribution (concentration ρ = 0.85) rather than a Gaussian Distribution, because the heavier tails throw the occasional hard turn, and a hard turn now and then is what an animal does. This is a stylised movement kernel, not a parameter fitted to wolf-tracking data. Energy falls with every step and is restored by a kill, whose odds rise with the prey underfoot. At zero, the wolf dies.

Memory is what makes the corridors last. Each wolf remembers where it has been, tagged with season, and when it needs a heading it finds the nearest length of its own track from that same season and follows it. A year of loose wandering is tightened, the next year, into a route worn by reuse. 

Underneath the agents, are four sparse grids on a 20-unit cell: prey, which regrows logistically and is drawn down at each kill; scent, laid down per pack and avoided by the others, which sorts the packs into territories without any territory being drawn; an optional cost-of-transport surface that can be read from a greyscale image, dark for cheap ground; and an optional trail layer in which use lowers cost and lower cost invites use — stigmergy, the logic of the ant path. 

Packs breed once a year at the den, split when they grow past ten, and send their grown wolves out to disperse and found packs of their own in empty ground. No route passes intact from one generation to the next. What persists is a field of tendencies: remembered tracks, altered costs, recurring seasons, pack continuity. Each generation enters ground already changed through movement.

## The Cartographic Record

The drawing separates ephemeral tracks from established routes. Line weight, value, and continuity encode how settled a route is: a single passage is thin and faint; a corridor reused across seasons is heavy, opaque, and continuous. This applies Jacques Bertin's visual variables (Bertin, 1983) to movement.

The drawing makes the route itself the document. Treating the line as the primary record places the work within Tim Ingold's account of the map as a trace of paths actually travelled (Ingold, 2007), with reuse and establishment shown directly in the weight of the line rather than annotated beside it.

Around the lines the plate carries conventional cartographic furniture. A second, quantitative layer reads the same tracks. Ex-cursus estimates a kernel density surface of occupancy and extracts isopleth contours from it by marching squares (Lorensen & Cline, 1987), producing utilisation-distribution bands for delimiting home range. The drawing and the measurement derive from a single dataset.

## Current Limits

I should be plain about the limit. This is not a validated model of wolves, and I am not an ecologist, but an architect that draws with ecologies. So, the bearings, the weights of the forces, the constants of energy and hunting are a bit speculative — tuned until the structure that emerges looks right, not fitted to field data. So, please read the output as something made, not as a prediction. The scale is nominal: a unit is a model-pixel, and a kilometre is whatever kmPerPixel says it is. 

The arithmetic is also plain, gradients by central differences on the grid, time stepped forward by simple Euler — enough to move animals convincingly and to make a clean drawing, and not a claim on the third decimal. The track buffer holds 100,000 segments; past that the oldest are dropped and counted, so a very long run draws only what it still remembers. And there is no test suite here yet.

## Running Ex-Cursus

The programme should run in the browser without a build step. Open `index.html` with its `js/` modules alongside — `rng`, `config`, `environment`, `memory`, `metrics`, `experiments`, and `simulation`. The interface divides into a drawing surface and a parameter sidebar; the five most-used parameters carry sparklines that show their recent history.

```bash
git clone https://github.com/USERNAME/cursus.git
cd cursus
open index.html
```

Exports serve research and exhibition together. Vector SVG writes the full plate for printing at any size; PNG and JPEG give raster copies; a WebM recording and a timelapse capture the drawing as it forms; JSON and CSV carry the metrics. Each export is labelled with its seed, so any output traces back to its run.

## References

The references below mark the ecological, computational, and cartographic work from which Ex-Cursus was developed.

L. David Mech and Luigi Boitani, eds., Wolves: Behavior, Ecology, and Conservation (Chicago: University of Chicago Press, 2003).

Aldo Leopold, “Thinking Like a Mountain,” in A Sand County Almanac, and Sketches Here and There (New York: Oxford University Press, 1949).

Bertin, J. (1983). *Semiology of Graphics: Diagrams, Networks, Maps* (W. J. Berg, Trans.). University of Wisconsin Press. (Original work published 1967.)

Couzin, I. D., Krause, J., James, R., Ruxton, G. D., & Franks, N. R. (2002). Collective memory and spatial sorting in animal groups. *Journal of Theoretical Biology*, 218(1), 1–11.

Fagan, W. F., Lewis, M. A., Auger-Méthé, M., Avgar, T., Benhamou, S., … Mueller, T. (2013). Spatial memory and animal movement. *Ecology Letters*, 16(10), 1316–1329.

Grassé, P.-P. (1959). La reconstruction du nid et les coordinations interindividuelles chez *Bellicositermes natalensis* et *Cubitermes* sp. La théorie de la stigmergie. *Insectes Sociaux*, 6(1), 41–80.

Grimm, V., & Railsback, S. F. (2005). *Individual-based Modeling and Ecology*. Princeton University Press.

Helbing, D., Keltsch, J., & Molnár, P. (1997). Modelling the evolution of human trail systems. *Nature*, 388(6637), 47–50.

Ingold, T. (2007). *Lines: A Brief History*. Routledge.

Jesmer, B. R.etal. (2018). Is ungulate migration culturally transmitted? Evidence of social learning from translocated animals. *Science*, 361(6406), 1023–1025.

Lorensen, W. E., & Cline, H. E. (1987). Marching cubes: a high resolution 3D surface construction algorithm. *ACM SIGGRAPH Computer Graphics*, 21(4), 163–169.

MacEachren, A. M. (1995). *How Maps Work: Representation, Visualization, and Design*. Guilford Press.

Michener, W. K., & Jones, M. B. (2012). Ecoinformatics: supporting ecology as a data-intensive science. *Trends in Ecology & Evolution*, 27(2), 85–93.

Moorcroft, P. R., & Lewis, M. A. (2006). *Mechanistic Home Range Analysis*. Princeton University Press.

Nathan, R., Getz, W. M., Revilla, E., Holyoak, M., Kadmon, R., Saltz, D., & Smouse, P. E. (2008). A movement ecology paradigm for unifying organismal movement research. *Proceedings of the National Academy of Sciences*, 105(49), 19052–19059.

Reynolds, C. W. (1987). Flocks, herds and schools: a distributed behavioral model. *ACM SIGGRAPH Computer Graphics*, 21(4), 25–34.


## Licence

Cursus is released under the MIT Licence. © 2021–2023 Asad Khan.
